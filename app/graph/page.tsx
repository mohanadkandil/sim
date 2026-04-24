"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/TopNav";
import D3ForceGraph from "@/components/graph/D3ForceGraph";
import { Upload, Loader2, RefreshCw, Play, Users, MessageSquare, Sparkles } from "lucide-react";
import { generateAgents, ForumAgent, SEGMENT_COLORS, createTopicWithPost, streamLiveSimulation, LiveSimulationEvent } from "@/lib/forum-api";

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
  bio?: string;
  status?: string;
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
  const streamedAgentsRef = useRef<ForumAgent[]>([]);  // Track agents during streaming

  // BroadcastChannel for real-time sync with forum
  const broadcastChannel = useRef<BroadcastChannel | null>(null);
  const [activeNodes, setActiveNodes] = useState<Set<string>>(new Set());

  // Simulation state
  const [featureText, setFeatureText] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const [simStatus, setSimStatus] = useState("");
  const [reactions, setReactions] = useState<Array<{
    agent_id: string;
    agent_name: string;
    segment: string;
    color: string;
    sentiment: string;
    comment: string;
    bio?: string;
    status?: string;
  }>>([]);
  const [pulsingNodes, setPulsingNodes] = useState<Set<string>>(new Set());
  const activityFeedRef = useRef<HTMLDivElement>(null);

  // Forum topic state
  const [topicId, setTopicId] = useState<string | null>(null);
  const [postId, setPostId] = useState<string | null>(null);
  const [topicTitle, setTopicTitle] = useState<string>("");
  const [creatingTopic, setCreatingTopic] = useState(false);

  // Live forum simulation state
  const [forumSimulating, setForumSimulating] = useState(false);
  const [forumEvents, setForumEvents] = useState<LiveSimulationEvent[]>([]);
  const [forumStats, setForumStats] = useState({ comments: 0, replies: 0, upvotes: 0 });
  const cleanupForumSim = useRef<(() => void) | null>(null);

  // Start simulation with reactions
  const startSimulation = useCallback(async (feature: string, agentsList: ForumAgent[]) => {
    if (!feature || agentsList.length === 0) return;

    setIsSimulating(true);
    setSimStatus("Starting simulation...");
    setReactions([]);

    try {
      const response = await fetch(`${API_BASE}/stream-reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feature: feature,
          agents: agentsList.map(a => ({
            id: a.id,
            name: a.name,
            segment: a.segment,
            color: a.segment_color,
            traits: {
              patience: a.patience,
              tech_level: a.tech_level,
              price_sensitivity: a.price_sensitivity,
            }
          }))
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No reader");

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "status") {
                setSimStatus(data.message);
              } else if (data.type === "reaction") {
                // Add reaction to feed
                setReactions(prev => [...prev, {
                  agent_id: data.agent_id,
                  agent_name: data.agent_name,
                  segment: data.segment,
                  color: data.color,
                  sentiment: data.sentiment,
                  comment: data.comment,
                }]);

                // Make node pulse
                setPulsingNodes(prev => new Set(prev).add(data.agent_id));
                setTimeout(() => {
                  setPulsingNodes(prev => {
                    const next = new Set(prev);
                    next.delete(data.agent_id);
                    return next;
                  });
                }, 1500);

                // Update node sentiment
                setNodes(prev => prev.map(n =>
                  n.id === data.agent_id
                    ? { ...n, sentiment: data.sentiment as "positive" | "negative" | "neutral" }
                    : n
                ));

                // Scroll activity feed
                setTimeout(() => {
                  activityFeedRef.current?.scrollTo({
                    top: activityFeedRef.current.scrollHeight,
                    behavior: 'smooth'
                  });
                }, 50);

                setSimStatus(`${data.index}/${data.total} reactions`);
              } else if (data.type === "complete") {
                setSimStatus(`Complete: ${data.total_reactions} reactions`);
                setIsSimulating(false);

                // Create forum topic automatically after simulation completes
                if (feature && agentsList.length > 0 && !topicId) {
                  setCreatingTopic(true);
                  createTopicWithPost(feature, sessionStorage.getItem("crucible_graph_id") || undefined, agentsList)
                    .then((result) => {
                      if (result.success && result.topic && result.post) {
                        setTopicId(result.topic.id);
                        setPostId(result.post.id);
                        setTopicTitle(result.topic.name);
                        // Store for forum page
                        sessionStorage.setItem("crucible_topic_id", result.topic.id);
                        sessionStorage.setItem("crucible_topic", JSON.stringify(result.topic));
                        sessionStorage.setItem("crucible_post", JSON.stringify(result.post));

                        // START LIVE FORUM SIMULATION immediately!
                        setForumSimulating(true);
                        setForumEvents([]);

                        cleanupForumSim.current = streamLiveSimulation(
                          result.topic.id,
                          result.post.id,
                          result.post.content,
                          result.post.title,
                          agentsList,
                          {
                            rounds: 40,
                            delayMs: 1000,
                            onEvent: (event) => {
                              // Store events for forum page
                              setForumEvents(prev => [...prev, event]);

                              // Update stats
                              if (event.type === 'comment') {
                                setForumStats(prev => ({ ...prev, comments: prev.comments + 1 }));
                                // Make node pulse
                                if (event.agent_id) {
                                  setPulsingNodes(prev => new Set(prev).add(event.agent_id!));
                                  setTimeout(() => {
                                    setPulsingNodes(prev => {
                                      const next = new Set(prev);
                                      next.delete(event.agent_id!);
                                      return next;
                                    });
                                  }, 1500);
                                }
                              } else if (event.type === 'reply') {
                                setForumStats(prev => ({ ...prev, replies: prev.replies + 1 }));
                                if (event.agent_id) {
                                  setPulsingNodes(prev => new Set(prev).add(event.agent_id!));
                                  setTimeout(() => {
                                    setPulsingNodes(prev => {
                                      const next = new Set(prev);
                                      next.delete(event.agent_id!);
                                      return next;
                                    });
                                  }, 1500);
                                }
                              } else if (event.type === 'vote') {
                                setForumStats(prev => ({ ...prev, upvotes: prev.upvotes + 1 }));
                              }

                              // Store events in sessionStorage for forum page
                              const storedEvents = JSON.parse(sessionStorage.getItem("crucible_forum_events") || "[]");
                              storedEvents.push(event);
                              sessionStorage.setItem("crucible_forum_events", JSON.stringify(storedEvents.slice(-100)));
                            },
                            onComplete: (stats, adoptionScore) => {
                              setForumSimulating(false);
                              sessionStorage.setItem("crucible_forum_complete", "true");
                              sessionStorage.setItem("crucible_adoption_score", String(adoptionScore));
                            },
                            onError: (err) => {
                              console.error("Forum simulation error:", err);
                              setForumSimulating(false);
                            }
                          }
                        );
                      }
                    })
                    .finally(() => setCreatingTopic(false));
                }
              } else if (data.type === "error") {
                setError(data.message);
                setIsSimulating(false);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (err) {
      console.error("Simulation error:", err);
      setIsSimulating(false);
    }
  }, []);

  // Start streaming build via SSE
  const startStreamingBuild = useCallback((inputFeatureText: string) => {
    setFeatureText(inputFeatureText); // Store for simulation
    setIsStreaming(true);
    setStreamStatus("Connecting...");
    setStreamProgress(0);
    setNodes([]);
    setLinks([]);
    setReactions([]); // Clear previous reactions

    // Use fetch with POST for SSE (EventSource doesn't support POST)
    const startStream = async () => {
      try {
        const response = await fetch(`${API_BASE}/stream-build`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: inputFeatureText,
            project_name: inputFeatureText.slice(0, 50),
            simulation_requirement: `Simulate how users would react to this feature: ${inputFeatureText}`,
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
        setStreamStatus(`Analyzing: ${data.entity_types} concepts found`);
        setStreamProgress(data.progress || 15);
        break;

      case "graph_created":
        setStreamGraphId(data.graph_id);
        setStreamStatus("Building knowledge graph...");
        setStreamProgress(data.progress || 25);
        // Clear previous agents
        streamedAgentsRef.current = [];
        break;

      case "agent":
        // Add new agent as a node with animation
        setNodes((prev) => {
          if (prev.some((n) => n.id === data.id)) return prev;
          return [
            ...prev,
            {
              id: data.id,
              name: data.name,
              activity: data.status || `${data.segment.replace('_', ' ')}`,
              bio: data.bio,
              status: data.status,
              sentiment: data.segment === 'churned' ? 'negative' as const :
                        data.segment === 'power_user' ? 'positive' as const :
                        data.segment === 'new_user' ? 'curious' as const : 'neutral' as const,
              location: data.segment.replace('_', ' '),
              color: data.color || "#8B5CF6",
              avatar: data.avatar,
            },
          ];
        });

        // Track agent in ref for sessionStorage
        const newAgent: ForumAgent = {
          id: data.id,
          name: data.name,
          avatar: data.avatar,
          segment: data.segment,
          segment_color: data.color,
          entity_id: data.entity_id,
          entity_type: data.entity_type,
          entity_summary: data.bio || data.status || '',
          bio: data.bio,
          status: data.status,
          ...data.traits
        };
        streamedAgentsRef.current.push(newAgent);

        // Also update state for UI
        setAgents((prev) => {
          if (prev.some((a) => a.id === data.id)) return prev;
          return [...prev, newAgent];
        });
        setStreamProgress(data.progress || 50);
        break;

      case "edge":
        // Add edge between agents
        setLinks((prev) => {
          if (prev.some((l) =>
            (l.source === data.source && l.target === data.target) ||
            (l.source === data.target && l.target === data.source)
          )) return prev;
          return [
            ...prev,
            {
              source: data.source,
              target: data.target,
              type: data.relation === 'same_segment' ? 'work' as const : 'social' as const,
            },
          ];
        });
        break;

      case "complete":
        setStreamStatus(`Ready: ${data.agent_count} agents, ${data.edge_count || 0} connections`);
        setStreamProgress(100);
        setIsStreaming(false);

        // Store agents for forum using ref (ensures we have all agents)
        sessionStorage.setItem("crucible_agents", JSON.stringify(streamedAgentsRef.current));
        if (data.graph_id) {
          sessionStorage.setItem("crucible_graph_id", data.graph_id);
          // Navigate to the persistent graph URL
          router.push(`/graph/${data.graph_id}`);
        }
        break;

      case "error":
        setError(data.message);
        setIsStreaming(false);
        break;
    }
  }, []);

  // Fetch projects on mount and check for stream mode
  useEffect(() => {
    // If there's an active graph session, go straight back to it
    const activeGraphId = sessionStorage.getItem("crucible_graph_id");
    const streamMode = sessionStorage.getItem("crucible_stream_mode");
    const featureText = sessionStorage.getItem("crucible_feature_text");

    if (activeGraphId && !streamMode) {
      router.replace(`/graph/${activeGraphId}`);
      return;
    }

    fetchProjects();

    if (streamMode === "true" && featureText) {
      sessionStorage.removeItem("crucible_stream_mode");
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
      cleanupForumSim.current?.();
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
      router.push(topicId ? `/forum/${topicId}` : "/forum");
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
                  <div className="text-sm font-medium text-[#2D2D2D]">Generating Agents</div>
                  <div className="text-xs text-[#8E8E93]">{streamStatus}</div>
                </div>
              </div>
              <div className="w-full bg-[#F0EFEC] rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#22C55E] transition-all duration-500 ease-out"
                  style={{ width: `${streamProgress}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-[#8E8E93]">
                <span>{nodes.length} agents</span>
                <span>
                  {nodes.filter(n => n.location === 'power user').length} power •
                  {nodes.filter(n => n.location === 'casual').length} casual •
                  {nodes.filter(n => n.location === 'new user').length} new
                </span>
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
              pulsingNodes={pulsingNodes}
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
                AGENT SEGMENTS
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#8B5CF6" }} />
                  <span className="text-[11px] text-[#6B6B6B]">Power User</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#22C55E" }} />
                  <span className="text-[11px] text-[#6B6B6B]">Casual</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#FBBF24" }} />
                  <span className="text-[11px] text-[#6B6B6B]">New User</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#F97316" }} />
                  <span className="text-[11px] text-[#6B6B6B]">Churned</span>
                </div>
              </div>
              {/* Sentiment Legend */}
              <div className="text-[11px] font-semibold text-[#8E8E93] mt-3 mb-2">
                SENTIMENT
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
                  <span className="text-[11px] text-[#6B6B6B]">Positive</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#EF4444]" />
                  <span className="text-[11px] text-[#6B6B6B]">Negative</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#9B8AA8]" />
                  <span className="text-[11px] text-[#6B6B6B]">Neutral</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Activity Feed Sidebar */}
        {(reactions.length > 0 || isSimulating || forumSimulating || forumEvents.length > 0) && (
          <div className="w-[320px] bg-white border-l border-[#F0EFEC] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-[#F0EFEC]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#8B5CF6]" />
                  <span className="text-sm font-semibold text-[#2D2D2D]">
                    {forumSimulating ? 'Live Forum' : 'Live Reactions'}
                  </span>
                </div>
                {(isSimulating || forumSimulating) && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-[#22C55E] rounded-full animate-pulse" />
                    <span className="text-[10px] text-[#8E8E93]">
                      {forumSimulating ? `${forumStats.comments} comments` : simStatus}
                    </span>
                  </div>
                )}
              </div>
              {featureText && (
                <div className="mt-2 p-2 bg-[#F7F6F3] rounded-lg">
                  <div className="text-[10px] text-[#8E8E93] mb-1">FEATURE:</div>
                  <p className="text-xs text-[#2D2D2D] line-clamp-2">{featureText}</p>
                </div>
              )}
              {forumSimulating && topicTitle && (
                <div className="mt-2 p-2 bg-[#E8F5E9] rounded-lg">
                  <div className="text-[10px] text-[#4A5D43] mb-1">SUBREDDIT:</div>
                  <p className="text-xs font-medium text-[#2D2D2D]">r/{topicTitle.replace(/\s+/g, '')}</p>
                </div>
              )}
            </div>

            {/* Reactions List */}
            <div
              ref={activityFeedRef}
              className="flex-1 overflow-y-auto p-3 space-y-2"
            >
              {reactions.map((reaction, i) => {
                // Find agent to get rich data
                const agent = agents.find(a => a.id === reaction.agent_id);
                const agentStatus = agent?.status || reaction.segment.replace('_', ' ');
                const agentBio = agent?.bio;

                return (
                  <div
                    key={i}
                    className="p-3 rounded-lg bg-[#FAFAF8] border border-[#F0EFEC] animate-in slide-in-from-right duration-300"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0"
                        style={{ backgroundColor: reaction.color }}
                      >
                        {reaction.agent_name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-[#2D2D2D] truncate">
                          {reaction.agent_name}
                        </div>
                        <div className="text-[10px] text-[#8B5CF6] truncate">
                          {agentStatus}
                        </div>
                      </div>
                      <div
                        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                          reaction.sentiment === 'positive' ? 'bg-[#22C55E]' :
                          reaction.sentiment === 'negative' ? 'bg-[#EF4444]' :
                          'bg-[#9B8AA8]'
                        }`}
                      />
                    </div>
                    <p className="text-sm text-[#2D2D2D] leading-relaxed mb-1">
                      "{reaction.comment}"
                    </p>
                    {agentBio && (
                      <p className="text-[10px] text-[#8E8E93] line-clamp-2 mt-1">
                        {agentBio}
                      </p>
                    )}
                  </div>
                );
              })}

              {reactions.length === 0 && isSimulating && (
                <div className="flex items-center justify-center h-32 text-[#8E8E93] text-sm">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Waiting for reactions...
                </div>
              )}

              {/* Forum Events */}
              {forumEvents.filter(e => e.type === 'comment' || e.type === 'reply').map((event, i) => (
                <div
                  key={`forum-${i}`}
                  className="p-3 rounded-lg bg-[#F0FDF4] border border-[#BBF7D0] animate-in slide-in-from-right duration-300"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0"
                      style={{ backgroundColor: event.segment_color || '#8B5CF6' }}
                    >
                      {event.agent_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-[#2D2D2D] truncate">
                        {event.agent_name}
                      </div>
                      <div className="text-[10px] text-[#22C55E]">
                        {event.type === 'reply' ? `↩️ replying to ${event.parent_author}` : '💬 commenting'}
                      </div>
                    </div>
                    <div
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        event.sentiment === 'positive' ? 'bg-[#22C55E]' :
                        event.sentiment === 'negative' ? 'bg-[#EF4444]' :
                        'bg-[#9B8AA8]'
                      }`}
                    />
                  </div>
                  <p className="text-sm text-[#2D2D2D] leading-relaxed">
                    "{event.content}"
                  </p>
                </div>
              ))}

              {forumEvents.length === 0 && forumSimulating && (
                <div className="flex items-center justify-center h-32 text-[#8E8E93] text-sm">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Agents are discussing...
                </div>
              )}
            </div>

            {/* Summary Stats */}
            {(reactions.length > 0 || forumEvents.length > 0) && (
              <div className="p-3 border-t border-[#F0EFEC] bg-[#FAFAF8]">
                {/* Reaction stats */}
                {reactions.length > 0 && (
                  <div className="flex justify-between text-[11px] mb-2">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
                      <span className="text-[#6B6B6B]">
                        {reactions.filter(r => r.sentiment === 'positive').length} positive
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-[#EF4444]" />
                      <span className="text-[#6B6B6B]">
                        {reactions.filter(r => r.sentiment === 'negative').length} negative
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-[#9B8AA8]" />
                      <span className="text-[#6B6B6B]">
                        {reactions.filter(r => r.sentiment === 'neutral').length} neutral
                      </span>
                    </div>
                  </div>
                )}
                {/* Forum stats */}
                {forumEvents.length > 0 && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#6B6B6B]">💬 {forumStats.comments} comments</span>
                    <span className="text-[#6B6B6B]">↩️ {forumStats.replies} replies</span>
                    <span className="text-[#6B6B6B]">👍 {forumStats.upvotes} votes</span>
                  </div>
                )}
              </div>
            )}

            {/* Go to Forum Button */}
            {!isSimulating && (reactions.length > 0 || forumEvents.length > 0) && (
              <div className="p-3 border-t border-[#F0EFEC]">
                {creatingTopic ? (
                  <div className="flex items-center justify-center gap-2 text-[#8E8E93] py-2.5">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Creating subreddit...</span>
                  </div>
                ) : topicId ? (
                  <div className="space-y-2">
                    <div className="text-center">
                      <div className="text-[10px] text-[#8E8E93]">
                        {forumSimulating ? 'LIVE DISCUSSION' : 'SUBREDDIT READY'}
                      </div>
                      <div className="text-sm font-medium text-[#2D2D2D]">r/{topicTitle.replace(/\s+/g, '')}</div>
                      {forumSimulating && (
                        <div className="text-[10px] text-[#22C55E] mt-1 animate-pulse">
                          {forumStats.comments + forumStats.replies} interactions happening...
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => router.push(`/forum/${topicId}`)}
                      className={`w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors ${
                        forumSimulating
                          ? 'bg-[#22C55E] text-white hover:bg-[#16A34A]'
                          : 'bg-[#7C9070] text-white hover:bg-[#6A7D60]'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      {forumSimulating ? 'Watch Live Discussion' : 'Open Subreddit'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => router.push(topicId ? `/forum/${topicId}` : '/forum')}
                    className="w-full flex items-center justify-center gap-2 bg-[#7C9070] text-white rounded-lg py-2.5 text-sm font-medium hover:bg-[#6A7D60] transition-colors"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Continue in Forum
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Node Details Sidebar */}
        {selectedNode && !(reactions.length > 0 || isSimulating) && (
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

            {(selectedNode.bio || selectedNode.activity) && (
              <div className="bg-[#F7F6F3] rounded-lg p-3 mb-4">
                {selectedNode.status && (
                  <div className="text-[10px] font-medium text-[#8B5CF6] mb-2">
                    {selectedNode.status}
                  </div>
                )}
                <div className="text-[11px] font-semibold text-[#8E8E93] mb-1">
                  ABOUT
                </div>
                <p className="text-sm text-[#2D2D2D]">{selectedNode.bio || selectedNode.activity}</p>
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
