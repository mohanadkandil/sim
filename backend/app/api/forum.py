"""
Forum API Blueprint
Handles dynamic agent generation from graph and forum simulation
"""

import json
import random
import time
import uuid
from typing import Dict, Any, List, Optional, Generator
from flask import Blueprint, request, jsonify, Response, stream_with_context
from dataclasses import dataclass, field, asdict

from ..config import Config
from ..utils.logger import get_logger
from ..utils.llm_client import LLMClient
from ..services.forum_agent_generator import ForumAgentGenerator, ForumAgent
from ..services.forum_simulator import ForumSimulator

logger = get_logger('crucible.forum')

forum_bp = Blueprint('forum', __name__, url_prefix='/api/forum')

# In-memory storage for topics and posts (would use DB in production)
_topics: Dict[str, Dict[str, Any]] = {}
_posts: Dict[str, Dict[str, Any]] = {}
_agents: Dict[str, List[ForumAgent]] = {}  # graph_id -> agents


@forum_bp.route('/generate-agents', methods=['POST'])
def generate_agents():
    """
    Generate agents from graph entities

    Request:
        {
            "graph_id": "crucible_abc123",
            "count": 200,
            "active_count": 75,
            "segments": {
                "power_user": 0.35,
                "casual": 0.30,
                "new_user": 0.25,
                "churned": 0.10
            }
        }

    Response:
        {
            "success": true,
            "agents": [...]
        }
    """
    try:
        data = request.get_json()
        graph_id = data.get('graph_id')
        count = data.get('count', 200)
        active_count = data.get('active_count', 75)
        segments = data.get('segments', {
            'power_user': 0.35,
            'casual': 0.30,
            'new_user': 0.25,
            'churned': 0.10
        })

        if not graph_id:
            return jsonify({'success': False, 'error': 'graph_id is required'}), 400

        logger.info(f"Generating {count} agents for graph {graph_id}")

        # Generate agents
        generator = ForumAgentGenerator()
        agents = generator.generate_agents(
            graph_id=graph_id,
            count=count,
            segments=segments
        )

        # Store agents for later use
        _agents[graph_id] = agents

        # Convert to dict for JSON response
        agents_data = [agent.to_dict() for agent in agents]

        logger.info(f"Generated {len(agents)} agents for graph {graph_id}")

        return jsonify({
            'success': True,
            'agents': agents_data,
            'total_count': len(agents),
            'active_count': active_count,
            'segments': segments
        })

    except Exception as e:
        logger.error(f"Error generating agents: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500


@forum_bp.route('/create-topic', methods=['POST'])
def create_topic():
    """
    Create a new topic/subreddit for a feature

    Request:
        {
            "name": "AI Autocomplete Feature",
            "description": "Discussion about the new AI autocomplete feature",
            "graph_id": "crucible_abc123"
        }

    Response:
        {
            "success": true,
            "topic": {...}
        }
    """
    try:
        data = request.get_json()
        name = data.get('name')
        description = data.get('description', '')
        graph_id = data.get('graph_id')

        if not name:
            return jsonify({'success': False, 'error': 'name is required'}), 400

        topic_id = f"topic_{uuid.uuid4().hex[:8]}"

        # Create subreddit-style name
        subreddit_name = 'r/' + name.replace(' ', '').replace('-', '')[:20]

        topic = {
            'id': topic_id,
            'name': name,
            'subreddit': subreddit_name,
            'description': description,
            'graph_id': graph_id,
            'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'post_count': 0,
            'comment_count': 0,
            'member_count': len(_agents.get(graph_id, []))
        }

        _topics[topic_id] = topic

        logger.info(f"Created topic: {topic_id} - {subreddit_name}")

        return jsonify({
            'success': True,
            'topic': topic
        })

    except Exception as e:
        logger.error(f"Error creating topic: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@forum_bp.route('/post', methods=['POST'])
def create_post():
    """
    Create a new post in a topic

    Request:
        {
            "topic_id": "topic_abc123",
            "content": "We're thinking of adding AI autocomplete...",
            "title": "New Feature: AI Autocomplete",
            "author": "PM"
        }

    Response:
        {
            "success": true,
            "post": {...}
        }
    """
    try:
        data = request.get_json()
        topic_id = data.get('topic_id')
        content = data.get('content')
        title = data.get('title', '')
        author = data.get('author', 'PM')

        if not topic_id or not content:
            return jsonify({'success': False, 'error': 'topic_id and content are required'}), 400

        if topic_id not in _topics:
            return jsonify({'success': False, 'error': 'Topic not found'}), 404

        post_id = f"post_{uuid.uuid4().hex[:8]}"

        post = {
            'id': post_id,
            'topic_id': topic_id,
            'title': title,
            'content': content,
            'author': author,
            'author_type': 'pm',
            'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'upvotes': 1,
            'downvotes': 0,
            'comments': []
        }

        _posts[post_id] = post
        _topics[topic_id]['post_count'] += 1

        logger.info(f"Created post: {post_id} in topic {topic_id}")

        return jsonify({
            'success': True,
            'post': post
        })

    except Exception as e:
        logger.error(f"Error creating post: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500


@forum_bp.route('/simulate-response', methods=['GET'])
def simulate_response_sse():
    """
    Simulate agent responses using Server-Sent Events (SSE)

    Query params:
        topic_id: Topic ID
        post_id: Post ID
        active_count: Number of agents to respond (default 75)

    SSE Response:
        data: {"agent_id": "...", "action": "comment", "content": "...", "sentiment": "positive"}
    """
    topic_id = request.args.get('topic_id')
    post_id = request.args.get('post_id')
    active_count = int(request.args.get('active_count', 75))

    if not topic_id or not post_id:
        return jsonify({'success': False, 'error': 'topic_id and post_id are required'}), 400

    if topic_id not in _topics:
        return jsonify({'success': False, 'error': 'Topic not found'}), 404

    if post_id not in _posts:
        return jsonify({'success': False, 'error': 'Post not found'}), 404

    topic = _topics[topic_id]
    post = _posts[post_id]
    graph_id = topic.get('graph_id')

    # Get agents for this graph
    agents = _agents.get(graph_id, [])
    if not agents:
        return jsonify({'success': False, 'error': 'No agents found for this graph'}), 404

    def generate_responses():
        """Generator for SSE responses"""
        simulator = ForumSimulator()

        # Get active subset of agents
        active_agents = random.sample(agents, min(active_count, len(agents)))

        logger.info(f"Simulating {len(active_agents)} agent responses for post {post_id}")

        stats = {
            'comments': 0,
            'upvotes': 0,
            'downvotes': 0,
            'silent': 0
        }

        for response in simulator.simulate_responses(
            agents=active_agents,
            post_content=post['content'],
            post_title=post.get('title', '')
        ):
            # Track stats
            action = response.get('action', 'silent')
            if action == 'comment':
                stats['comments'] += 1
                # Store comment in post
                comment = {
                    'id': f"comment_{uuid.uuid4().hex[:8]}",
                    'agent_id': response['agent_id'],
                    'agent_name': response['agent_name'],
                    'agent_segment': response['agent_segment'],
                    'content': response.get('content', ''),
                    'sentiment': response.get('sentiment', 'neutral'),
                    'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
                    'upvotes': random.randint(0, 10),
                    'downvotes': random.randint(0, 3)
                }
                _posts[post_id]['comments'].append(comment)
                _topics[topic_id]['comment_count'] += 1
            elif action == 'upvote':
                stats['upvotes'] += 1
                _posts[post_id]['upvotes'] += 1
            elif action == 'downvote':
                stats['downvotes'] += 1
                _posts[post_id]['downvotes'] += 1
            else:
                stats['silent'] += 1

            # Yield SSE event
            yield f"data: {json.dumps(response)}\n\n"

        # Send completion event
        completion = {
            'type': 'complete',
            'stats': stats,
            'adoption_score': calculate_adoption_score(stats)
        }
        yield f"data: {json.dumps(completion)}\n\n"

        logger.info(f"Simulation complete: {stats}")

    return Response(
        stream_with_context(generate_responses()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        }
    )


@forum_bp.route('/topics/<topic_id>/activity', methods=['GET'])
def get_topic_activity(topic_id: str):
    """
    Get all posts and comments for a topic
    """
    if topic_id not in _topics:
        return jsonify({'success': False, 'error': 'Topic not found'}), 404

    topic = _topics[topic_id]

    # Get all posts for this topic
    posts = [p for p in _posts.values() if p['topic_id'] == topic_id]

    return jsonify({
        'success': True,
        'topic': topic,
        'posts': posts
    })


@forum_bp.route('/topics', methods=['GET'])
def list_topics():
    """
    List all topics
    """
    graph_id = request.args.get('graph_id')

    topics = list(_topics.values())

    if graph_id:
        topics = [t for t in topics if t.get('graph_id') == graph_id]

    return jsonify({
        'success': True,
        'topics': topics
    })


@forum_bp.route('/agents/<graph_id>', methods=['GET'])
def get_agents(graph_id: str):
    """
    Get agents for a graph
    """
    agents = _agents.get(graph_id, [])

    return jsonify({
        'success': True,
        'agents': [agent.to_dict() for agent in agents],
        'count': len(agents)
    })


def calculate_adoption_score(stats: Dict[str, int]) -> float:
    """
    Calculate adoption score based on agent responses

    Positive responses increase score, negative decrease
    """
    total = stats['comments'] + stats['upvotes'] + stats['downvotes']
    if total == 0:
        return 0.5  # Neutral

    positive = stats['upvotes']
    negative = stats['downvotes']

    # Weight comments by sentiment (would be calculated from actual sentiment)
    # For now, assume 50% positive, 30% neutral, 20% negative
    comment_positive = int(stats['comments'] * 0.5)
    comment_negative = int(stats['comments'] * 0.2)

    positive += comment_positive
    negative += comment_negative

    score = (positive - negative) / total
    # Normalize to 0-1 range
    score = (score + 1) / 2

    return round(score, 2)
