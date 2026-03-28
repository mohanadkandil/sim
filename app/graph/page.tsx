"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/TopNav";
import D3ForceGraph from "@/components/graph/D3ForceGraph";
import { Upload, Loader2, RefreshCw, Play, Users, MessageSquare, Sparkles } from "lucide-react";
import { generateAgents, ForumAgent, SEGMENT_COLORS } from "@/lib/forum-api";

const API_BASE = "http://localhost:5001/api/graph";

// Color palette for node labels
const LABEL_COLORS: Record<string, string> = {
  Person: "#7C9070",
  User: "#7C9070",
  Feature: "#5B9BD5",
  PainPoint: "#EF4444",
  Segment: "#9B8AA8",
  Product: "#E9C46A",
  Feedback: "#81B29A",
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

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [simRequirement, setSimRequirement] = useState("Simulate user reactions to new product features");

  // Agent state
  const [agents, setAgents] = useState<ForumAgent[]>([]);
  const [generatingAgents, setGeneratingAgents] = useState(false);
  const [agentCount, setAgentCount] = useState(200);

  // Streaming mode state (MiroFish-style progressive loading)
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamStatus, setStreamStatus] = useState("");
  const [streamProgress, setStreamProgress] = useState(0);
  const [streamGraphId, setStreamGraphId] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // BroadcastChannel for real-time sync with forum
  const broadcastChannel = useRef<BroadcastChannel | null>(null);
  const [activeNodes, setActiveNodes] = useState<Set<string>>(new Set());

  // Start streaming build via SSE
  const startStreamingBuild = useCallback((featureText: string) => {
    setIsStreaming(true);
    setStreamStatus("Connecting...");
    setStreamProgress(0);
    setNodes([]);
    setLinks([]);

    // Use fetch with POST for SSE (EventSource doesn't support POST)
    const startStream = async () => {
      try {
        const response = await fetch(`${API_BASE}/stream-build`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: featureText,
            project_name: featureText.slice(0, 50),
            simulation_requirement: `Simulate how users would react to this feature: ${featureText}`,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("No reader available");
        }

        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE messages
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                handleStreamEvent(data);
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      } catch (err) {
        console.error("Stream error:", err);
        setIsStreaming(false);
        setError("Failed to connect to backend");
      }
    };

    startStream();
  }, []);

  // Handle SSE events
  const handleStreamEvent = useCallback((data: any) => {
    switch (data.type) {
      case "status":
        setStreamStatus(data.message);
        setStreamProgress(data.progress || 0);
        break;

      case "ontology":
        setStreamStatus(`Ontology: ${data.entity_types} types, ${data.edge_types} relations`);
        setStreamProgress(data.progress || 15);
        break;

      case "graph_created":
        setStreamGraphId(data.graph_id);
        setStreamStatus("Graph created, extracting entities...");
        setStreamProgress(data.progress || 25);
        break;

      case "node":
        // Add new node with animation
        setNodes((prev) => {
          if (prev.some((n) => n.id === data.id)) return prev;
          return [
            ...prev,
            {
              id: data.id,
              name: data.name,
              activity: data.summary || "",
              sentiment: "neutral" as const,
              location: data.label || "Entity",
              color: data.color || "#8E8E93",
            },
          ];
        });
        break;

      case "edge":
        // Add new edge
        setLinks((prev) => {
          if (prev.some((l) => l.source === data.source && l.target === data.target)) return prev;
          return [
            ...prev,
            {
              source: data.source,
              target: data.target,
              type: "social" as const,
            },
          ];
        });
        break;

      case "complete":
        setStreamStatus(`Complete: ${data.node_count} entities, ${data.edge_count} connections`);
        setStreamProgress(100);
        setIsStreaming(false);
        // Refresh projects list
        fetchProjects();
        break;

      case "error":
        setError(data.message);
        setIsStreaming(false);
        break;
    }
  }, []);

  // Fetch projects on mount and check for stream mode
  useEffect(() => {
    fetchProjects();

    // Check if we should start streaming (from home page)
    const streamMode = sessionStorage.getItem("crucible_stream_mode");
    const featureText = sessionStorage.getItem("crucible_feature_text");

    if (streamMode === "true" && featureText) {
      // Clear session storage
      sessionStorage.removeItem("crucible_stream_mode");
      sessionStorage.removeItem("crucible_feature_text");

      // Start streaming build
      startStreamingBuild(featureText);
    }

    // Also check for legacy auto-load
    const projectId = sessionStorage.getItem("crucible_project_id");
    const taskId = sessionStorage.getItem("crucible_task_id");

    if (projectId && taskId) {
      sessionStorage.removeItem("crucible_project_id");
      sessionStorage.removeItem("crucible_task_id");
      setBuildingGraph(true);
      pollTaskStatus(taskId);
    }

    // Cleanup on unmount
    return () => {
      eventSourceRef.current?.close();
    };
  }, [startStreamingBuild]);

  // Set up BroadcastChannel for real-time sync with forum
  useEffect(() => {
    broadcastChannel.current = new BroadcastChannel("crucible_sync");

    broadcastChannel.current.onmessage = (event) => {
      if (event.data.type === "AGENT_ACTION") {
        const { entityId, sentiment, agentId } = event.data;

        // Highlight the node temporarily
        if (entityId) {
          setActiveNodes((prev) => new Set(prev).add(entityId));

          // Remove highlight after 3 seconds
          setTimeout(() => {
            setActiveNodes((prev) => {
              const next = new Set(prev);
              next.delete(entityId);
              return next;
            });
          }, 3000);
        }
      }
    };

    return () => {
      broadcastChannel.current?.close();
    };
  }, []);

  // Load agents from sessionStorage if available
  useEffect(() => {
    const storedAgents = sessionStorage.getItem("crucible_agents");
    if (storedAgents) {
      try {
        setAgents(JSON.parse(storedAgents));
      } catch (e) {
        console.error("Failed to parse stored agents:", e);
      }
    }
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("files", file);
    formData.append("simulation_requirement", simRequirement);
    formData.append("project_name", file.name.replace(/\.[^/.]+$/, ""));

    try {
      const res = await fetch(`${API_BASE}/ontology/generate`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setShowUpload(false);
        fetchProjects();
        // Auto-select the new project
        const newProject: Project = {
          project_id: data.data.project_id,
          name: data.data.project_name,
          status: "ontology_generated",
          graph_id: null,
          created_at: new Date().toISOString(),
        };
        setSelectedProject(newProject);
      } else {
        setError(data.error || "Upload failed");
      }
    } catch (err) {
      setError("Failed to upload file");
      console.error(err);
    } finally {
      setUploading(false);
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

  // Generate agents from graph
  const handleGenerateAgents = async () => {
    if (!selectedProject?.graph_id) return;

    setGeneratingAgents(true);
    setError(null);

    try {
      const result = await generateAgents(
        selectedProject.graph_id,
        agentCount,
        Math.min(75, agentCount) // active count
      );

      if (result.success) {
        setAgents(result.agents);
        // Store in sessionStorage for forum page
        sessionStorage.setItem("crucible_agents", JSON.stringify(result.agents));
        sessionStorage.setItem("crucible_graph_id", selectedProject.graph_id);
      } else {
        setError(result.error || "Failed to generate agents");
      }
    } catch (err) {
      setError("Failed to generate agents");
      console.error(err);
    } finally {
      setGeneratingAgents(false);
    }
  };

  // Navigate to forum
  const goToForum = () => {
    if (agents.length > 0) {
      router.push("/forum");
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#F7F6F3]">
      <TopNav />

      <div className="flex-1 flex">
        {/* Sidebar - Project List */}
        <div className="w-[280px] bg-white border-r border-[#F0EFEC] p-4 flex flex-col gap-4 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#2D2D2D]">Projects</h2>
            <div className="flex gap-1">
              <button
                onClick={() => setShowUpload(!showUpload)}
                className="p-1.5 rounded-lg hover:bg-[#F7F6F3] transition-colors"
                title="Upload document"
              >
                <Upload className="w-4 h-4 text-[#7C9070]" />
              </button>
              <button
                onClick={fetchProjects}
                className="p-1.5 rounded-lg hover:bg-[#F7F6F3] transition-colors"
              >
                <RefreshCw className="w-4 h-4 text-[#8E8E93]" />
              </button>
            </div>
          </div>

          {/* Upload Form */}
          {showUpload && (
            <div className="bg-[#F7F6F3] rounded-lg p-3 flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 block">
                  Simulation Goal
                </label>
                <input
                  type="text"
                  value={simRequirement}
                  onChange={(e) => setSimRequirement(e.target.value)}
                  className="w-full text-xs p-2 rounded border border-[#E5E5E5] bg-white"
                  placeholder="What do you want to simulate?"
                />
              </div>
              <label className="flex items-center justify-center gap-2 bg-[#7C9070] text-white rounded-lg py-2 px-3 text-sm font-medium hover:bg-[#6A7D60] transition-colors cursor-pointer">
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload Document
                  </>
                )}
                <input
                  type="file"
                  accept=".pdf,.md,.txt,.markdown"
                  onChange={handleUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              <p className="text-[10px] text-[#8E8E93] text-center">
                Supports PDF, Markdown, TXT
              </p>
            </div>
          )}

          {projects.length === 0 ? (
            <div className="text-sm text-[#8E8E93] text-center py-4">
              No projects yet. Upload a document to get started.
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

          {/* Generate Agents Button */}
          {selectedProject?.graph_id && selectedProject.status === "graph_completed" && (
            <div className="mt-auto flex flex-col gap-2">
              {agents.length === 0 ? (
                <>
                  <div>
                    <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 block">
                      Number of Agents
                    </label>
                    <input
                      type="number"
                      value={agentCount}
                      onChange={(e) => setAgentCount(Math.max(10, Math.min(500, parseInt(e.target.value) || 200)))}
                      className="w-full text-xs p-2 rounded border border-[#E5E5E5] bg-white"
                      min={10}
                      max={500}
                    />
                  </div>
                  <button
                    onClick={handleGenerateAgents}
                    disabled={generatingAgents}
                    className="flex items-center justify-center gap-2 bg-[#8B5CF6] text-white rounded-lg py-2.5 px-4 text-sm font-medium hover:bg-[#7C3AED] transition-colors disabled:opacity-50"
                  >
                    {generatingAgents ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Users className="w-4 h-4" />
                        Generate {agentCount} Agents
                      </>
                    )}
                  </button>
                </>
              ) : (
                <>
                  <div className="bg-[#F7F6F3] rounded-lg p-3">
                    <div className="text-[11px] font-semibold text-[#8E8E93] mb-2">
                      AGENTS READY
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(
                        agents.reduce((acc, agent) => {
                          acc[agent.segment] = (acc[agent.segment] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>)
                      ).map(([segment, count]) => (
                        <span
                          key={segment}
                          className="text-[10px] px-2 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: SEGMENT_COLORS[segment as keyof typeof SEGMENT_COLORS] || "#8E8E93" }}
                        >
                          {segment.replace("_", " ")}: {count}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-[#6B6B6B]">
                      {agents.length} agents total
                    </div>
                  </div>
                  <button
                    onClick={goToForum}
                    className="flex items-center justify-center gap-2 bg-[#22C55E] text-white rounded-lg py-2.5 px-4 text-sm font-medium hover:bg-[#16A34A] transition-colors"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Go to Forum
                  </button>
                  <button
                    onClick={() => {
                      setAgents([]);
                      sessionStorage.removeItem("crucible_agents");
                    }}
                    className="text-xs text-[#8E8E93] hover:text-[#EF4444] text-center"
                  >
                    Clear agents
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Main Graph Area */}
        <div className="flex-1 relative">
          {/* Streaming Progress Overlay */}
          {isStreaming && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-white rounded-xl border border-[#F0EFEC] shadow-lg p-4 w-[340px]">
              <div className="flex items-center gap-3 mb-3">
                <div className="relative">
                  <Sparkles className="w-5 h-5 text-[#8B5CF6]" />
                  <div className="absolute inset-0 animate-ping">
                    <Sparkles className="w-5 h-5 text-[#8B5CF6] opacity-30" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-[#2D2D2D]">Building Graph</div>
                  <div className="text-xs text-[#8E8E93]">{streamStatus}</div>
                </div>
              </div>
              <div className="w-full bg-[#F0EFEC] rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#7C9070] transition-all duration-500 ease-out"
                  style={{ width: `${streamProgress}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-[#8E8E93]">
                <span>{nodes.length} entities</span>
                <span>{links.length} connections</span>
                <span>{streamProgress}%</span>
              </div>
            </div>
          )}

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
          ) : !isStreaming ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-[#8E8E93]">
                <p className="mb-2">Select a project to view its graph</p>
                <p className="text-sm">
                  Or upload documents to create a new graph
                </p>
              </div>
            </div>
          ) : null}

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
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#8B5CF6" }} />
                  <span className="text-[11px] text-[#6B6B6B]">Segment</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#7C9070" }} />
                  <span className="text-[11px] text-[#6B6B6B]">User</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#5B9BD5" }} />
                  <span className="text-[11px] text-[#6B6B6B]">Feature</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#EF4444" }} />
                  <span className="text-[11px] text-[#6B6B6B]">Pain Point</span>
                </div>
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
