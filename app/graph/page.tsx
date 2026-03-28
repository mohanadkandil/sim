"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/TopNav";
import D3ForceGraph from "@/components/graph/D3ForceGraph";
import { Upload, Loader2, RefreshCw, Play, Trash2 } from "lucide-react";

const API_BASE = "http://localhost:5000/api/graph";

// Color palette for node labels
const LABEL_COLORS: Record<string, string> = {
  Person: "#7C9070",
  Organization: "#5B9BD5",
  Location: "#D4845E",
  Event: "#9B8AA8",
  Product: "#E9C46A",
  Concept: "#81B29A",
  default: "#8E8E93",
};

interface Project {
  project_id: string;
  name: string;
  status: string;
  graph_id: string | null;
  created_at: string;
}

interface GraphNode {
  id: string;
  name: string;
  activity: string;
  sentiment: "positive" | "negative" | "neutral" | "curious";
  location: string;
  color: string;
}

interface GraphLink {
  source: string;
  target: string;
  type: "family" | "coliving" | "college" | "work" | "social";
}

export default function GraphPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buildingGraph, setBuildingGraph] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_BASE}/project/list`);
      const data = await res.json();
      if (data.success) {
        setProjects(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch projects:", err);
    }
  };

  const fetchGraphData = async (graphId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/data/${graphId}`);
      const data = await res.json();

      if (data.success) {
        // Transform Zep nodes to D3 format
        const transformedNodes: GraphNode[] = data.data.nodes.map((node: any) => ({
          id: node.uuid,
          name: node.name || "Unknown",
          activity: node.summary || "",
          sentiment: "neutral" as const,
          location: node.labels?.[0] || "Entity",
          color: LABEL_COLORS[node.labels?.[0]] || LABEL_COLORS.default,
        }));

        // Transform Zep edges to D3 format
        const transformedLinks: GraphLink[] = data.data.edges.map((edge: any) => ({
          source: edge.source_node_uuid,
          target: edge.target_node_uuid,
          type: "social" as const, // Default type
        }));

        setNodes(transformedNodes);
        setLinks(transformedLinks);
      } else {
        setError(data.error || "Failed to load graph");
      }
    } catch (err) {
      setError("Failed to connect to backend");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleProjectSelect = (project: Project) => {
    setSelectedProject(project);
    if (project.graph_id && project.status === "graph_completed") {
      fetchGraphData(project.graph_id);
    } else {
      setNodes([]);
      setLinks([]);
    }
  };

  const buildGraph = async () => {
    if (!selectedProject) return;

    setBuildingGraph(true);
    setBuildProgress(0);

    try {
      const res = await fetch(`${API_BASE}/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: selectedProject.project_id }),
      });

      const data = await res.json();
      if (data.success) {
        // Poll task status
        const taskId = data.data.task_id;
        pollTaskStatus(taskId);
      } else {
        setError(data.error);
        setBuildingGraph(false);
      }
    } catch (err) {
      setError("Failed to start graph build");
      setBuildingGraph(false);
    }
  };

  const pollTaskStatus = async (taskId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/task/${taskId}`);
        const data = await res.json();

        if (data.success) {
          const task = data.data;
          setBuildProgress(task.progress || 0);

          if (task.status === "completed") {
            clearInterval(interval);
            setBuildingGraph(false);
            fetchProjects();
            if (task.result?.graph_id) {
              fetchGraphData(task.result.graph_id);
            }
          } else if (task.status === "failed") {
            clearInterval(interval);
            setBuildingGraph(false);
            setError(task.message || "Build failed");
          }
        }
      } catch (err) {
        clearInterval(interval);
        setBuildingGraph(false);
      }
    }, 2000);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#F7F6F3]">
      <TopNav />

      <div className="flex-1 flex">
        {/* Sidebar - Project List */}
        <div className="w-[280px] bg-white border-r border-[#F0EFEC] p-4 flex flex-col gap-4 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#2D2D2D]">Projects</h2>
            <button
              onClick={fetchProjects}
              className="p-1.5 rounded-lg hover:bg-[#F7F6F3] transition-colors"
            >
              <RefreshCw className="w-4 h-4 text-[#8E8E93]" />
            </button>
          </div>

          {projects.length === 0 ? (
            <div className="text-sm text-[#8E8E93] text-center py-8">
              No projects yet.
              <br />
              Upload documents to create a graph.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {projects.map((project) => (
                <button
                  key={project.project_id}
                  onClick={() => handleProjectSelect(project)}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    selectedProject?.project_id === project.project_id
                      ? "border-[#7C9070] bg-[rgba(124,144,112,0.08)]"
                      : "border-[#F0EFEC] hover:bg-[#FAFAF8]"
                  }`}
                >
                  <div className="text-sm font-medium text-[#2D2D2D] truncate">
                    {project.name}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        project.status === "graph_completed"
                          ? "bg-[#E8F5E9] text-[#4A5D43]"
                          : project.status === "graph_building"
                          ? "bg-[#FFF3E0] text-[#D4845E]"
                          : "bg-[#F5F5F5] text-[#8E8E93]"
                      }`}
                    >
                      {project.status.replace("_", " ")}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Build Graph Button */}
          {selectedProject && selectedProject.status === "ontology_generated" && (
            <button
              onClick={buildGraph}
              disabled={buildingGraph}
              className="mt-auto flex items-center justify-center gap-2 bg-[#7C9070] text-white rounded-lg py-2.5 px-4 text-sm font-medium hover:bg-[#6A7D60] transition-colors disabled:opacity-50"
            >
              {buildingGraph ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Building... {buildProgress}%
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Build Graph
                </>
              )}
            </button>
          )}
        </div>

        {/* Main Graph Area */}
        <div className="flex-1 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-[#7C9070] animate-spin" />
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-[#EF4444] mb-2">{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="text-sm text-[#7C9070] hover:underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : nodes.length > 0 ? (
            <D3ForceGraph
              nodes={nodes}
              links={links}
              onNodeClick={(node) => setSelectedNode(node)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-[#8E8E93]">
                <p className="mb-2">Select a project to view its graph</p>
                <p className="text-sm">
                  Or upload documents to create a new graph
                </p>
              </div>
            </div>
          )}

          {/* Stats Overlay */}
          {nodes.length > 0 && (
            <div className="absolute top-4 right-4 bg-white rounded-lg border border-[#F0EFEC] shadow-sm p-4">
              <div className="text-[11px] font-semibold text-[#8E8E93] mb-2">
                GRAPH STATS
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between gap-4">
                  <span className="text-xs text-[#6B6B6B]">Nodes</span>
                  <span className="text-sm font-semibold text-[#2D2D2D]">
                    {nodes.length}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-xs text-[#6B6B6B]">Edges</span>
                  <span className="text-sm font-semibold text-[#2D2D2D]">
                    {links.length}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Legend */}
          {nodes.length > 0 && (
            <div className="absolute bottom-4 left-4 bg-white rounded-lg border border-[#F0EFEC] shadow-sm p-4">
              <div className="text-[11px] font-semibold text-[#8E8E93] mb-2">
                ENTITY TYPES
              </div>
              <div className="flex flex-col gap-1.5">
                {Object.entries(LABEL_COLORS)
                  .filter(([key]) => key !== "default")
                  .map(([label, color]) => (
                    <div key={label} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-[11px] text-[#6B6B6B]">{label}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Node Details Sidebar */}
        {selectedNode && (
          <div className="w-[300px] bg-white border-l border-[#F0EFEC] p-5 overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-[#2D2D2D]">
                  {selectedNode.name}
                </h3>
                <span className="text-xs text-[#8E8E93]">
                  {selectedNode.location}
                </span>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-[#8E8E93] hover:text-[#2D2D2D]"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {selectedNode.activity && (
              <div className="bg-[#F7F6F3] rounded-lg p-3 mb-4">
                <div className="text-[11px] font-semibold text-[#8E8E93] mb-1">
                  SUMMARY
                </div>
                <p className="text-sm text-[#2D2D2D]">{selectedNode.activity}</p>
              </div>
            )}

            <div className="text-[11px] font-semibold text-[#8E8E93] mb-2">
              CONNECTIONS
            </div>
            <div className="flex flex-col gap-2">
              {links
                .filter(
                  (l) => l.source === selectedNode.id || l.target === selectedNode.id
                )
                .slice(0, 10)
                .map((link, i) => {
                  const otherId =
                    link.source === selectedNode.id ? link.target : link.source;
                  const otherNode = nodes.find((n) => n.id === otherId);
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2 border-b border-[#F0EFEC] last:border-0"
                    >
                      <span className="text-sm text-[#2D2D2D]">
                        {otherNode?.name || "Unknown"}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
