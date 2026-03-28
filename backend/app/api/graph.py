"""
Graph-related API routes
Uses a project context mechanism with server-side persistent state
"""

import os
import json
import traceback
import threading
import time
from flask import request, jsonify, Response, stream_with_context

from . import graph_bp
from ..config import Config
from ..services.ontology_generator import OntologyGenerator
from ..services.graph_builder import GraphBuilderService
from ..services.text_processor import TextProcessor
from ..utils.file_parser import FileParser
from ..utils.logger import get_logger
from ..utils.zep_paging import fetch_all_nodes, fetch_all_edges
from ..models.task import TaskManager, TaskStatus
from ..models.project import ProjectManager, ProjectStatus

logger = get_logger('crucible.api')


def allowed_file(filename: str) -> bool:
    """Check whether the file extension is allowed"""
    if not filename or '.' not in filename:
        return False
    ext = os.path.splitext(filename)[1].lower().lstrip('.')
    return ext in Config.ALLOWED_EXTENSIONS


# ============== Project management endpoints ==============

@graph_bp.route('/project/<project_id>', methods=['GET'])
def get_project(project_id: str):
    """
    Get project details
    """
    project = ProjectManager.get_project(project_id)
    
    if not project:
        return jsonify({
            "success": False,
            "error": f"Project does not exist: {project_id}"
        }), 404
    
    return jsonify({
        "success": True,
        "data": project.to_dict()
    })


@graph_bp.route('/project/list', methods=['GET'])
def list_projects():
    """
    List all projects
    """
    limit = request.args.get('limit', 50, type=int)
    projects = ProjectManager.list_projects(limit=limit)
    
    return jsonify({
        "success": True,
        "data": [p.to_dict() for p in projects],
        "count": len(projects)
    })


@graph_bp.route('/project/<project_id>', methods=['DELETE'])
def delete_project(project_id: str):
    """
    Delete a project
    """
    success = ProjectManager.delete_project(project_id)
    
    if not success:
        return jsonify({
            "success": False,
            "error": f"Project does not exist or deletion failed: {project_id}"
        }), 404
    
    return jsonify({
        "success": True,
        "message": f"Project deleted: {project_id}"
    })


@graph_bp.route('/project/<project_id>/reset', methods=['POST'])
def reset_project(project_id: str):
    """
    Reset project status (used to rebuild the graph)
    """
    project = ProjectManager.get_project(project_id)
    
    if not project:
        return jsonify({
            "success": False,
            "error": f"Project does not exist: {project_id}"
        }), 404
    
    # Reset to ontology-generated state
    if project.ontology:
        project.status = ProjectStatus.ONTOLOGY_GENERATED
    else:
        project.status = ProjectStatus.CREATED
    
    project.graph_id = None
    project.graph_build_task_id = None
    project.error = None
    ProjectManager.save_project(project)
    
    return jsonify({
        "success": True,
        "message": f"Project reset: {project_id}",
        "data": project.to_dict()
    })


# ============== Endpoint 1: Upload files and generate ontology ==============

@graph_bp.route('/ontology/generate', methods=['POST'])
def generate_ontology():
    """
    Endpoint 1: Upload files and generate ontology definition
    
    Request method: multipart/form-data
    
    Parameters:
        files: Uploaded files (PDF/MD/TXT), multiple allowed
        simulation_requirement: Simulation requirement description (required)
        project_name: Project name (optional)
        additional_context: Additional notes (optional)
        
    Returns:
        {
            "success": true,
            "data": {
                "project_id": "proj_xxxx",
                "ontology": {
                    "entity_types": [...],
                    "edge_types": [...],
                    "analysis_summary": "..."
                },
                "files": [...],
                "total_text_length": 12345
            }
        }
    """
    try:
        logger.info("=== Starting ontology generation ===")
        
        # Get parameters
        simulation_requirement = request.form.get('simulation_requirement', '')
        project_name = request.form.get('project_name', 'Unnamed Project')
        additional_context = request.form.get('additional_context', '')
        
        logger.debug(f"Project name: {project_name}")
        logger.debug(f"Simulation requirement: {simulation_requirement[:100]}...")
        
        if not simulation_requirement:
            return jsonify({
                "success": False,
                "error": "Please provide a simulation requirement description (simulation_requirement)"
            }), 400
        
        # Get uploaded files
        uploaded_files = request.files.getlist('files')
        if not uploaded_files or all(not f.filename for f in uploaded_files):
            return jsonify({
                "success": False,
                "error": "Please upload at least one document file"
            }), 400
        
        # Create project
        project = ProjectManager.create_project(name=project_name)
        project.simulation_requirement = simulation_requirement
        logger.info(f"Project created: {project.project_id}")
        
        # Save files and extract text
        document_texts = []
        all_text = ""
        
        for file in uploaded_files:
            if file and file.filename and allowed_file(file.filename):
                # Save file to project directory
                file_info = ProjectManager.save_file_to_project(
                    project.project_id, 
                    file, 
                    file.filename
                )
                project.files.append({
                    "filename": file_info["original_filename"],
                    "size": file_info["size"]
                })
                
                # Extract text
                text = FileParser.extract_text(file_info["path"])
                text = TextProcessor.preprocess_text(text)
                document_texts.append(text)
                all_text += f"\n\n=== {file_info['original_filename']} ===\n{text}"
        
        if not document_texts:
            ProjectManager.delete_project(project.project_id)
            return jsonify({
                "success": False,
                "error": "No documents were successfully processed. Please check the file formats."
            }), 400
        
        # Save extracted text
        project.total_text_length = len(all_text)
        ProjectManager.save_extracted_text(project.project_id, all_text)
        logger.info(f"Text extraction complete: {len(all_text)} characters total")
        
        # Generate ontology
        logger.info("Calling LLM to generate ontology definition...")
        generator = OntologyGenerator()
        ontology = generator.generate(
            document_texts=document_texts,
            simulation_requirement=simulation_requirement,
            additional_context=additional_context if additional_context else None
        )
        
        # Save ontology to project
        entity_count = len(ontology.get("entity_types", []))
        edge_count = len(ontology.get("edge_types", []))
        logger.info(f"Ontology generation complete: {entity_count} entity types, {edge_count} relationship types")
        
        project.ontology = {
            "entity_types": ontology.get("entity_types", []),
            "edge_types": ontology.get("edge_types", [])
        }
        project.analysis_summary = ontology.get("analysis_summary", "")
        project.status = ProjectStatus.ONTOLOGY_GENERATED
        ProjectManager.save_project(project)
        logger.info(f"=== Ontology generation complete === Project ID: {project.project_id}")
        
        return jsonify({
            "success": True,
            "data": {
                "project_id": project.project_id,
                "project_name": project.name,
                "ontology": project.ontology,
                "analysis_summary": project.analysis_summary,
                "files": project.files,
                "total_text_length": project.total_text_length
            }
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500


# ============== Endpoint 1b: Generate ontology from text (no file upload) ==============

@graph_bp.route('/ontology/generate-from-text', methods=['POST'])
def generate_ontology_from_text():
    """
    Generate ontology from text input directly (no file upload needed)

    Request (JSON):
        {
            "text": "Feature description text...",
            "simulation_requirement": "Simulate user reactions",
            "project_name": "My Feature"
        }

    Returns:
        {
            "success": true,
            "data": {
                "project_id": "proj_xxxx",
                "ontology": {...},
                "task_id": "task_xxxx"  // Graph build already started
            }
        }
    """
    try:
        logger.info("=== Starting ontology generation from text ===")

        data = request.get_json()
        text = data.get('text', '')
        simulation_requirement = data.get('simulation_requirement', 'Simulate user reactions to this feature')
        project_name = data.get('project_name', 'Feature Simulation')

        if not text:
            return jsonify({
                "success": False,
                "error": "Please provide text content"
            }), 400

        # Create project
        project = ProjectManager.create_project(name=project_name)
        project.simulation_requirement = simulation_requirement
        logger.info(f"Project created: {project.project_id}")

        # Store the text as document
        project.document_texts = [text]
        project.total_text_length = len(text)
        project.files = [{"filename": "input.txt", "size": len(text)}]

        # Generate ontology
        ontology_generator = OntologyGenerator()
        ontology = ontology_generator.generate(
            document_texts=[text],
            simulation_requirement=simulation_requirement,
            additional_context=None
        )

        project.ontology = {
            "entity_types": ontology.get("entity_types", []),
            "edge_types": ontology.get("edge_types", [])
        }
        project.analysis_summary = ontology.get("analysis_summary", "")
        project.status = ProjectStatus.ONTOLOGY_GENERATED
        ProjectManager.save_project(project)

        logger.info(f"Ontology generated for project: {project.project_id}")

        # Auto-start graph build
        task = TaskManager.create_task("graph_build")
        project.graph_build_task_id = task.task_id
        project.status = ProjectStatus.GRAPH_BUILDING
        ProjectManager.save_project(project)

        # Start build in background thread
        def build_graph_task():
            try:
                TaskManager.update_task(task.task_id, TaskStatus.RUNNING, progress=10, message="Starting graph build...")

                graph_builder = GraphBuilderService()
                graph_id = graph_builder.build_graph(
                    project_id=project.project_id,
                    graph_name=f"{project_name}_graph",
                    document_texts=[text],
                    ontology=project.ontology,
                    simulation_requirement=simulation_requirement,
                    task_id=task.task_id
                )

                project.graph_id = graph_id
                project.status = ProjectStatus.GRAPH_COMPLETED
                ProjectManager.save_project(project)

                TaskManager.update_task(
                    task.task_id,
                    TaskStatus.COMPLETED,
                    progress=100,
                    message="Graph build complete",
                    result={"graph_id": graph_id, "project_id": project.project_id}
                )
            except Exception as e:
                logger.error(f"Graph build failed: {e}")
                project.status = ProjectStatus.GRAPH_FAILED
                project.error = str(e)
                ProjectManager.save_project(project)
                TaskManager.update_task(task.task_id, TaskStatus.FAILED, message=str(e))

        thread = threading.Thread(target=build_graph_task)
        thread.daemon = True
        thread.start()

        logger.info(f"=== Auto-started graph build === Task ID: {task.task_id}")

        return jsonify({
            "success": True,
            "data": {
                "project_id": project.project_id,
                "project_name": project.name,
                "task_id": task.task_id,
                "ontology": project.ontology,
                "analysis_summary": project.analysis_summary,
                "message": "Ontology generated and graph build started"
            }
        })

    except Exception as e:
        logger.error(f"Error: {e}")
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500


# ============== Endpoint 2: Build graph ==============

@graph_bp.route('/build', methods=['POST'])
def build_graph():
    """
    Endpoint 2: Build graph based on project_id
    
    Request (JSON):
        {
            "project_id": "proj_xxxx",  // Required; from Endpoint 1
            "graph_name": "Graph name",  // Optional
            "chunk_size": 500,           // Optional; default 500
            "chunk_overlap": 50          // Optional; default 50
        }
        
    Returns:
        {
            "success": true,
            "data": {
                "project_id": "proj_xxxx",
                "task_id": "task_xxxx",
                "message": "Graph build task started"
            }
        }
    """
    try:
        logger.info("=== Starting graph build ===")
        
        # Check configuration
        errors = []
        if not Config.ZEP_API_KEY:
            errors.append("ZEP_API_KEY is not configured")
        if errors:
            logger.error(f"Configuration errors: {errors}")
            return jsonify({
                "success": False,
                "error": "Configuration error: " + "; ".join(errors)
            }), 500
        
        # Parse request
        data = request.get_json() or {}
        project_id = data.get('project_id')
        logger.debug(f"Request parameters: project_id={project_id}")
        
        if not project_id:
            return jsonify({
                "success": False,
                "error": "Please provide a project_id"
            }), 400
        
        # Get project
        project = ProjectManager.get_project(project_id)
        if not project:
            return jsonify({
                "success": False,
                "error": f"Project does not exist: {project_id}"
            }), 404
        
        # Check project status
        force = data.get('force', False)  # Force rebuild
        
        if project.status == ProjectStatus.CREATED:
            return jsonify({
                "success": False,
                "error": "Ontology has not been generated for this project. Please call /ontology/generate first."
            }), 400
        
        if project.status == ProjectStatus.GRAPH_BUILDING and not force:
            return jsonify({
                "success": False,
                "error": "Graph is currently being built. Please do not resubmit. To force rebuild, add force: true.",
                "task_id": project.graph_build_task_id
            }), 400
        
        # Reset status if force rebuild is requested
        if force and project.status in [ProjectStatus.GRAPH_BUILDING, ProjectStatus.FAILED, ProjectStatus.GRAPH_COMPLETED]:
            project.status = ProjectStatus.ONTOLOGY_GENERATED
            project.graph_id = None
            project.graph_build_task_id = None
            project.error = None
        
        # Get configuration
        graph_name = data.get('graph_name', project.name or 'Crucible Graph')
        chunk_size = data.get('chunk_size', project.chunk_size or Config.DEFAULT_CHUNK_SIZE)
        chunk_overlap = data.get('chunk_overlap', project.chunk_overlap or Config.DEFAULT_CHUNK_OVERLAP)
        
        # Update project configuration
        project.chunk_size = chunk_size
        project.chunk_overlap = chunk_overlap
        
        # Get extracted text
        text = ProjectManager.get_extracted_text(project_id)
        if not text:
            return jsonify({
                "success": False,
                "error": "No extracted text content found"
            }), 400
        
        # Get ontology
        ontology = project.ontology
        if not ontology:
            return jsonify({
                "success": False,
                "error": "No ontology definition found"
            }), 400
        
        # Create async task
        task_manager = TaskManager()
        task_id = task_manager.create_task(f"Build graph: {graph_name}")
        logger.info(f"Graph build task created: task_id={task_id}, project_id={project_id}")
        
        # Update project status
        project.status = ProjectStatus.GRAPH_BUILDING
        project.graph_build_task_id = task_id
        ProjectManager.save_project(project)
        
        # Start background task
        def build_task():
            build_logger = get_logger('crucible.build')
            try:
                build_logger.info(f"[{task_id}] Starting graph build...")
                task_manager.update_task(
                    task_id, 
                    status=TaskStatus.PROCESSING,
                    message="Initializing graph build service..."
                )
                
                # Create graph build service
                builder = GraphBuilderService(api_key=Config.ZEP_API_KEY)
                
                # Split into chunks
                task_manager.update_task(
                    task_id,
                    message="Splitting text into chunks...",
                    progress=5
                )
                chunks = TextProcessor.split_text(
                    text, 
                    chunk_size=chunk_size, 
                    overlap=chunk_overlap
                )
                total_chunks = len(chunks)
                
                # Create graph
                task_manager.update_task(
                    task_id,
                    message="Creating Zep graph...",
                    progress=10
                )
                graph_id = builder.create_graph(name=graph_name)
                
                # Update project's graph_id
                project.graph_id = graph_id
                ProjectManager.save_project(project)
                
                # Set ontology
                task_manager.update_task(
                    task_id,
                    message="Setting ontology definition...",
                    progress=15
                )
                builder.set_ontology(graph_id, ontology)
                
                # Add text (progress_callback signature is (msg, progress_ratio))
                def add_progress_callback(msg, progress_ratio):
                    progress = 15 + int(progress_ratio * 40)  # 15% - 55%
                    task_manager.update_task(
                        task_id,
                        message=msg,
                        progress=progress
                    )
                
                task_manager.update_task(
                    task_id,
                    message=f"Adding {total_chunks} text chunks...",
                    progress=15
                )
                
                episode_uuids = builder.add_text_batches(
                    graph_id, 
                    chunks,
                    batch_size=3,
                    progress_callback=add_progress_callback
                )
                
                # Wait for Zep to finish processing (query the processed status of each episode)
                task_manager.update_task(
                    task_id,
                    message="Waiting for Zep to process data...",
                    progress=55
                )
                
                def wait_progress_callback(msg, progress_ratio):
                    progress = 55 + int(progress_ratio * 35)  # 55% - 90%
                    task_manager.update_task(
                        task_id,
                        message=msg,
                        progress=progress
                    )
                
                builder._wait_for_episodes(episode_uuids, wait_progress_callback)
                
                # Get graph data
                task_manager.update_task(
                    task_id,
                    message="Fetching graph data...",
                    progress=95
                )
                graph_data = builder.get_graph_data(graph_id)
                
                # Update project status
                project.status = ProjectStatus.GRAPH_COMPLETED
                ProjectManager.save_project(project)
                
                node_count = graph_data.get("node_count", 0)
                edge_count = graph_data.get("edge_count", 0)
                build_logger.info(f"[{task_id}] Graph build complete: graph_id={graph_id}, nodes={node_count}, edges={edge_count}")
                
                # Complete
                task_manager.update_task(
                    task_id,
                    status=TaskStatus.COMPLETED,
                    message="Graph build complete",
                    progress=100,
                    result={
                        "project_id": project_id,
                        "graph_id": graph_id,
                        "node_count": node_count,
                        "edge_count": edge_count,
                        "chunk_count": total_chunks
                    }
                )
                
            except Exception as e:
                # Update project status to failed
                build_logger.error(f"[{task_id}] Graph build failed: {str(e)}")
                build_logger.debug(traceback.format_exc())
                
                project.status = ProjectStatus.FAILED
                project.error = str(e)
                ProjectManager.save_project(project)
                
                task_manager.update_task(
                    task_id,
                    status=TaskStatus.FAILED,
                    message=f"Build failed: {str(e)}",
                    error=traceback.format_exc()
                )
        
        # Start background thread
        thread = threading.Thread(target=build_task, daemon=True)
        thread.start()
        
        return jsonify({
            "success": True,
            "data": {
                "project_id": project_id,
                "task_id": task_id,
                "message": "Graph build task started. Check progress via /task/{task_id}"
            }
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500


# ============== Task query endpoints ==============

@graph_bp.route('/task/<task_id>', methods=['GET'])
def get_task(task_id: str):
    """
    Query task status
    """
    task = TaskManager().get_task(task_id)
    
    if not task:
        return jsonify({
            "success": False,
            "error": f"Task does not exist: {task_id}"
        }), 404
    
    return jsonify({
        "success": True,
        "data": task.to_dict()
    })


@graph_bp.route('/tasks', methods=['GET'])
def list_tasks():
    """
    List all tasks
    """
    tasks = TaskManager().list_tasks()
    
    return jsonify({
        "success": True,
        "data": [t.to_dict() for t in tasks],
        "count": len(tasks)
    })


# ============== Graph data endpoints ==============

@graph_bp.route('/data/<graph_id>', methods=['GET'])
def get_graph_data(graph_id: str):
    """
    Get graph data (nodes and edges)
    """
    try:
        if not Config.ZEP_API_KEY:
            return jsonify({
                "success": False,
                "error": "ZEP_API_KEY is not configured"
            }), 500
        
        builder = GraphBuilderService(api_key=Config.ZEP_API_KEY)
        graph_data = builder.get_graph_data(graph_id)
        
        return jsonify({
            "success": True,
            "data": graph_data
        })
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500


@graph_bp.route('/delete/<graph_id>', methods=['DELETE'])
def delete_graph(graph_id: str):
    """
    Delete a Zep graph
    """
    try:
        if not Config.ZEP_API_KEY:
            return jsonify({
                "success": False,
                "error": "ZEP_API_KEY is not configured"
            }), 500

        builder = GraphBuilderService(api_key=Config.ZEP_API_KEY)
        builder.delete_graph(graph_id)

        return jsonify({
            "success": True,
            "message": f"Graph deleted: {graph_id}"
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500


# ============== SSE Streaming endpoint for progressive graph building ==============

# Segment colors for agents
SEGMENT_COLORS = {
    'power_user': '#8B5CF6',  # Violet
    'casual': '#22C55E',       # Green
    'new_user': '#FBBF24',     # Amber
    'churned': '#F97316'       # Orange
}


@graph_bp.route('/stream-build', methods=['POST'])
def stream_build():
    """
    SSE endpoint for progressive agent generation (MiroFish-style)

    Builds graph, then generates and streams agents one by one.

    Request (JSON):
        {
            "text": "Feature description...",
            "project_name": "My Feature",
            "simulation_requirement": "Simulate user reactions",
            "agent_count": 50
        }

    SSE Events:
        - status: Progress updates
        - ontology: Ontology generated
        - graph_created: Graph ID created
        - agent: New agent generated (one at a time)
        - complete: Build finished
        - error: Build failed
    """
    from ..services.forum_agent_generator import ForumAgentGenerator, FIRST_NAMES, LAST_NAMES
    import random
    import hashlib

    data = request.get_json() or {}
    text = data.get('text', '')
    project_name = data.get('project_name', 'Feature Simulation')
    simulation_requirement = data.get('simulation_requirement', 'Simulate user reactions')
    agent_count = data.get('agent_count', 50)  # Default to 50 agents

    if not text:
        return jsonify({"success": False, "error": "Text is required"}), 400

    def generate():
        try:
            from zep_cloud.client import Zep
            from zep_cloud import EpisodeData

            # Send initial status
            yield f"data: {json.dumps({'type': 'status', 'message': 'Starting...', 'progress': 0})}\n\n"

            # Step 1: Generate ontology
            yield f"data: {json.dumps({'type': 'status', 'message': 'Analyzing feature...', 'progress': 5})}\n\n"

            ontology_generator = OntologyGenerator()
            ontology = ontology_generator.generate(
                document_texts=[text],
                simulation_requirement=simulation_requirement,
                additional_context=None
            )

            entity_types = ontology.get("entity_types", [])
            edge_types = ontology.get("edge_types", [])

            yield f"data: {json.dumps({'type': 'ontology', 'entity_types': len(entity_types), 'edge_types': len(edge_types), 'progress': 15})}\n\n"

            # Step 2: Create graph in Zep
            yield f"data: {json.dumps({'type': 'status', 'message': 'Building knowledge graph...', 'progress': 20})}\n\n"

            builder = GraphBuilderService(api_key=Config.ZEP_API_KEY)
            graph_id = builder.create_graph(project_name)

            yield f"data: {json.dumps({'type': 'graph_created', 'graph_id': graph_id, 'progress': 25})}\n\n"

            # Step 3: Set ontology
            builder.set_ontology(graph_id, {
                "entity_types": entity_types,
                "edge_types": edge_types
            })

            # Step 4: Add text to graph
            yield f"data: {json.dumps({'type': 'status', 'message': 'Processing document...', 'progress': 30})}\n\n"

            zep_client = Zep(api_key=Config.ZEP_API_KEY)
            chunks = TextProcessor.split_text(text, chunk_size=500, overlap=50)

            # Add all chunks
            episode_uuids = []
            for i in range(0, len(chunks), 3):
                batch = chunks[i:i+3]
                episodes = [EpisodeData(data=chunk, type="text") for chunk in batch]
                try:
                    result = zep_client.graph.add_batch(graph_id=graph_id, episodes=episodes)
                    if result:
                        for ep in result:
                            ep_uuid = getattr(ep, 'uuid_', None) or getattr(ep, 'uuid', None)
                            if ep_uuid:
                                episode_uuids.append(ep_uuid)
                except Exception as e:
                    logger.warning(f"Batch error: {e}")
                time.sleep(0.5)

            # Step 5: Wait for Zep to process (short wait)
            yield f"data: {json.dumps({'type': 'status', 'message': 'Extracting entities...', 'progress': 40})}\n\n"
            time.sleep(3)  # Give Zep time to start processing

            # Step 6: Generate agents progressively
            yield f"data: {json.dumps({'type': 'status', 'message': f'Generating {agent_count} agents...', 'progress': 50})}\n\n"

            # Get entities from graph for agent generation
            entities = []
            try:
                nodes = fetch_all_nodes(zep_client, graph_id)
                for node in nodes:
                    entities.append({
                        'uuid': node.uuid_,
                        'name': node.name,
                        'entity_type': node.labels[0] if node.labels else 'Entity',
                        'summary': node.summary or ''
                    })
                logger.info(f"Found {len(entities)} entities for agent generation")
            except Exception as e:
                logger.warning(f"Could not fetch entities: {e}")

            # Segment distribution
            segments = {
                'power_user': 0.35,
                'casual': 0.30,
                'new_user': 0.25,
                'churned': 0.10
            }

            # Calculate counts per segment
            segment_counts = {seg: int(agent_count * pct) for seg, pct in segments.items()}
            total = sum(segment_counts.values())
            if total < agent_count:
                segment_counts['casual'] += agent_count - total

            # Shuffle entities for distribution
            entity_pool = list(entities) if entities else []
            random.shuffle(entity_pool)

            # Generate and stream agents one by one
            agent_num = 0
            all_agents = []  # Track all created agents for edge generation
            segment_agents = {seg: [] for seg in segments.keys()}  # Track agents by segment

            for segment, count in segment_counts.items():
                for i in range(count):
                    agent_num += 1

                    # Progress (50% - 85%)
                    progress = 50 + int((agent_num / agent_count) * 35)

                    # Get entity if available
                    entity = None
                    if entity_pool:
                        entity = entity_pool.pop(0)
                        if not entity_pool and entities:
                            entity_pool = list(entities)
                            random.shuffle(entity_pool)

                    # Generate agent name
                    if entity and entity.get('name') and entity.get('entity_type') == 'Person':
                        name = entity['name']
                    else:
                        name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"

                    # Generate avatar
                    name_hash = hashlib.md5(name.encode()).hexdigest()
                    avatar = f"https://api.dicebear.com/7.x/avataaars/svg?seed={name_hash}"

                    # Generate traits based on segment
                    traits = _get_segment_traits(segment)

                    agent_id = f"agent_{agent_num:03d}"

                    # Create agent data
                    agent_data = {
                        "type": "agent",
                        "id": agent_id,
                        "name": name,
                        "avatar": avatar,
                        "segment": segment,
                        "color": SEGMENT_COLORS.get(segment, '#8B5CF6'),
                        "entity_id": entity.get('uuid') if entity else None,
                        "entity_type": entity.get('entity_type', 'Person') if entity else 'Person',
                        "summary": entity.get('summary', '') if entity else '',
                        "traits": traits,
                        "progress": progress
                    }

                    yield f"data: {json.dumps(agent_data)}\n\n"

                    # Track agent for edge generation
                    all_agents.append(agent_id)
                    segment_agents[segment].append(agent_id)

                    time.sleep(0.06)  # Small delay for animation effect

            # Step 7: Generate edges between agents
            yield f"data: {json.dumps({'type': 'status', 'message': 'Building social connections...', 'progress': 88})}\n\n"

            edge_count = 0
            edges_created = set()

            # Create connections within segments (people in same segment know each other)
            for segment, agent_ids in segment_agents.items():
                if len(agent_ids) < 2:
                    continue

                # Each agent connects to 2-4 others in their segment
                for agent_id in agent_ids:
                    num_connections = random.randint(2, min(4, len(agent_ids) - 1))
                    potential_targets = [a for a in agent_ids if a != agent_id]
                    targets = random.sample(potential_targets, min(num_connections, len(potential_targets)))

                    for target_id in targets:
                        edge_key = tuple(sorted([agent_id, target_id]))
                        if edge_key not in edges_created:
                            edges_created.add(edge_key)
                            edge_count += 1

                            edge_data = {
                                "type": "edge",
                                "id": f"edge_{edge_count:03d}",
                                "source": agent_id,
                                "target": target_id,
                                "relation": "same_segment"
                            }
                            yield f"data: {json.dumps(edge_data)}\n\n"
                            time.sleep(0.02)

            # Create some cross-segment connections (random social ties)
            yield f"data: {json.dumps({'type': 'status', 'message': 'Adding cross-group connections...', 'progress': 93})}\n\n"

            num_cross_connections = agent_count // 4  # ~25% of agent count
            for _ in range(num_cross_connections):
                if len(all_agents) < 2:
                    break

                agent1, agent2 = random.sample(all_agents, 2)
                edge_key = tuple(sorted([agent1, agent2]))

                if edge_key not in edges_created:
                    edges_created.add(edge_key)
                    edge_count += 1

                    edge_data = {
                        "type": "edge",
                        "id": f"edge_{edge_count:03d}",
                        "source": agent1,
                        "target": agent2,
                        "relation": "social"
                    }
                    yield f"data: {json.dumps(edge_data)}\n\n"
                    time.sleep(0.02)

            # Complete
            yield f"data: {json.dumps({'type': 'complete', 'graph_id': graph_id, 'agent_count': agent_count, 'edge_count': edge_count, 'entity_count': len(entities), 'progress': 100})}\n\n"

        except Exception as e:
            logger.error(f"Stream build error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': '*'
        }
    )


def _get_segment_traits(segment: str) -> dict:
    """Get typical traits for a segment"""
    import random
    traits = {
        'power_user': {
            'patience': random.choice(['low', 'medium']),
            'tech_level': random.choice(['intermediate', 'advanced']),
            'price_sensitivity': 'low',
            'communication_style': random.choice(['detailed', 'brief']),
        },
        'casual': {
            'patience': 'medium',
            'tech_level': random.choice(['beginner', 'intermediate']),
            'price_sensitivity': 'medium',
            'communication_style': 'balanced',
        },
        'new_user': {
            'patience': 'high',
            'tech_level': 'beginner',
            'price_sensitivity': random.choice(['medium', 'high']),
            'communication_style': random.choice(['balanced', 'emotional']),
        },
        'churned': {
            'patience': 'low',
            'tech_level': random.choice(['beginner', 'intermediate', 'advanced']),
            'price_sensitivity': 'high',
            'communication_style': random.choice(['brief', 'emotional']),
        }
    }
    return traits.get(segment, traits['casual'])
