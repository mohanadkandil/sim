"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import TopNav from "@/components/TopNav";
import D3ForceGraph from "@/components/graph/D3ForceGraph";
import { Loader2, MessageSquare, Sparkles, Play } from "lucide-react";
import { useActivity } from "@/lib/activity-context";
import {
  ForumAgent,
  createTopicWithPost,
  streamLiveSimulation,
  LiveSimulationEvent,
  SEGMENT_COLORS,
} from "@/lib/forum-api";
import { createAvatar } from "@dicebear/core";
import { micah } from "@dicebear/collection";

function agentAvatar(name: string): string {
  const svg = createAvatar(micah, { seed: name }).toString();
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const API_BASE = "http://localhost:5001/api/graph";

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

interface GraphData {
  graph_id: string;
  project_id: string;
  project_name: string;
  nodes: any[];
  edges: any[];
  agents: any[];
  feature_text?: string;
}

export default function GraphDetailPage() {
  const params = useParams();
  const router = useRouter();
  const graphId = params.graphId as string;
  const { showActivity, setActivityCount } = useActivity();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [agents, setAgents] = useState<ForumAgent[]>([]);
  const [featureText, setFeatureText] = useState("");

  // Simulation state
  const [isSimulating, setIsSimulating] = useState(false);
  const [simStatus, setSimStatus] = useState("");
  const [reactions, setReactions] = useState<
    Array<{
      agent_id: string;
      agent_name: string;
      segment: string;
      color: string;
      sentiment: string;
      comment: string;
    }>
  >([]);
  const [pulsingNodes, setPulsingNodes] = useState<Set<string>>(new Set());
  const activityFeedRef = useRef<HTMLDivElement>(null);

  // Topic state
  const [topicId, setTopicId] = useState<string | null>(null);
  const [topicTitle, setTopicTitle] = useState<string>("");
  const [creatingTopic, setCreatingTopic] = useState(false);

  // Forum simulation state
  const [forumSimulating, setForumSimulating] = useState(false);
  const [forumEvents, setForumEvents] = useState<LiveSimulationEvent[]>([]);
  const [forumStats, setForumStats] = useState({
    comments: 0,
    replies: 0,
    upvotes: 0,
  });
  const cleanupForumSim = useRef<(() => void) | null>(null);

  // Sync activity count with reactions + forum events
  useEffect(() => {
    setActivityCount(reactions.length + forumEvents.length);
  }, [reactions.length, forumEvents.length, setActivityCount]);

  // Load graph data
  useEffect(() => {
    if (!graphId) return;

    const loadGraph = async () => {
      setLoading(true);
      setError(null);

      try {
        // FIRST: Check sessionStorage for agents (from streaming build)
        const storedAgents = sessionStorage.getItem("crucible_agents");
        let loadedAgents: ForumAgent[] = [];

        console.log("Loading graph:", graphId);
        console.log("Stored agents:", storedAgents ? "found" : "not found");

        if (storedAgents) {
          try {
            loadedAgents = JSON.parse(storedAgents);
            setAgents(loadedAgents);

            // Create nodes from agents
            const agentNodes: GraphNode[] = loadedAgents.map((agent: ForumAgent) => ({
              id: agent.id,
              name: agent.name,
              activity: agent.status || agent.segment.replace('_', ' '),
              bio: agent.bio,
              status: agent.status,
              sentiment: agent.segment === 'churned' ? 'negative' as const :
                        agent.segment === 'power_user' ? 'positive' as const :
                        agent.segment === 'new_user' ? 'curious' as const : 'neutral' as const,
              location: agent.segment.replace('_', ' '),
              color: agent.segment_color || "#8B5CF6",
              avatar: agentAvatar(agent.name),
            }));

            setNodes(agentNodes);

            // Create links between same-segment agents
            const agentLinks: GraphLink[] = [];
            const segmentGroups: Record<string, string[]> = {};
            loadedAgents.forEach((agent: ForumAgent) => {
              if (!segmentGroups[agent.segment]) {
                segmentGroups[agent.segment] = [];
              }
              segmentGroups[agent.segment].push(agent.id);
            });

            // Connect some agents within same segment
            Object.values(segmentGroups).forEach((ids) => {
              for (let i = 0; i < Math.min(ids.length - 1, 20); i++) {
                const j = Math.floor(Math.random() * (ids.length - i - 1)) + i + 1;
                agentLinks.push({
                  source: ids[i],
                  target: ids[j],
                  type: "social" as const,
                });
              }
            });

            setLinks(agentLinks);
          } catch (e) {
            console.error("Failed to parse stored agents:", e);
          }
        }

        // If no agents in sessionStorage, try backend
        if (loadedAgents.length === 0) {
          // Try to get graph data from backend
          const res = await fetch(`${API_BASE}/data/${graphId}`);
          const data = await res.json();

          if (data.success && data.data) {
            setGraphData(data.data);

            // Transform nodes for D3
            const transformedNodes: GraphNode[] = (data.data.nodes || []).map(
              (node: any) => ({
                id: node.uuid || node.id,
                name: node.name || "Unknown",
                activity: node.summary || node.status || "",
                bio: node.bio,
                status: node.status,
                sentiment: "neutral" as const,
                location: node.labels?.[0] || node.segment || "Entity",
                color: node.color || "#8B5CF6",
              })
            );

            const transformedLinks: GraphLink[] = (data.data.edges || []).map(
              (edge: any) => ({
                source: edge.source_node_uuid || edge.source,
                target: edge.target_node_uuid || edge.target,
                type: "social" as const,
              })
            );

            setNodes(transformedNodes);
            setLinks(transformedLinks);

            // Check for agents in response
            if (data.data.agents && data.data.agents.length > 0) {
              setAgents(data.data.agents);
            }
          }

          // Also try agents endpoint — add them as graph nodes too
          try {
            const agentsRes = await fetch(
              `http://localhost:5001/api/forum/agents/${graphId}`
            );
            const agentsData = await agentsRes.json();
            if (agentsData.success && agentsData.agents && agentsData.agents.length > 0) {
              const fetchedAgents: ForumAgent[] = agentsData.agents;
              setAgents(fetchedAgents);

              const agentNodes: GraphNode[] = fetchedAgents.map((agent: ForumAgent) => ({
                id: agent.id,
                name: agent.name,
                activity: agent.status || agent.segment.replace('_', ' '),
                bio: agent.bio,
                status: agent.status,
                sentiment: agent.segment === 'churned' ? 'negative' as const :
                          agent.segment === 'power_user' ? 'positive' as const :
                          agent.segment === 'new_user' ? 'curious' as const : 'neutral' as const,
                location: agent.segment.replace('_', ' '),
                color: agent.segment_color || "#8B5CF6",
                avatar: agentAvatar(agent.name),
              }));

              setNodes(prev => {
                const existingIds = new Set(prev.map(n => n.id));
                const newAgentNodes = agentNodes.filter(n => !existingIds.has(n.id));
                return [...prev, ...newAgentNodes];
              });
            }
          } catch (e) {
            // Ignore agent fetch errors
          }
        }

        // Check for pending feature text from sessionStorage
        const storedFeature = sessionStorage.getItem("crucible_feature_text");
        console.log("Stored feature text:", storedFeature ? storedFeature.slice(0, 50) + "..." : "not found");
        if (storedFeature) {
          setFeatureText(storedFeature);
          // Don't clear yet - will be cleared when simulation starts
        }

        // Store graphId
        sessionStorage.setItem("crucible_graph_id", graphId);
      } catch (err) {
        console.error("Error loading graph:", err);
        setError("Failed to load graph");
      } finally {
        setLoading(false);
      }
    };

    loadGraph();

    return () => {
      cleanupForumSim.current?.();
    };
  }, [graphId]);

  // Auto-start simulation if feature text exists and we have agents
  useEffect(() => {
    if (featureText && agents.length > 0 && !isSimulating && nodes.length > 0 && !topicId) {
      console.log("Auto-starting simulation with", agents.length, "agents");

      // Create forum topic FIRST, then start simulation
      const initSimulation = async () => {
        try {
          // Create topic immediately
          console.log("Creating forum topic before simulation...");
          const result = await createTopicWithPost(featureText, graphId, agents);
          console.log("Topic creation result:", result);

          if (result.success && result.topic && result.post) {
            setTopicId(result.topic.id);
            setTopicTitle(result.topic.name);
            sessionStorage.setItem("crucible_topic_id", result.topic.id);
            sessionStorage.setItem("crucible_topic", JSON.stringify(result.topic));
            sessionStorage.setItem("crucible_post", JSON.stringify(result.post));

            // Start forum simulation in background (backend handles this)
            setForumSimulating(true);
            streamLiveSimulation(
              result.topic.id,
              result.post.id,
              featureText,
              result.topic.name,
              agents,
              {
                rounds: 40,
                onEvent: (event) => {
                  setForumEvents((prev) => [...prev, event]);
                },
                onComplete: () => {
                  setForumSimulating(false);
                },
                onError: (err) => {
                  console.error("Forum simulation error:", err);
                  setForumSimulating(false);
                },
              }
            );
          }
        } catch (err) {
          console.error("Failed to create topic:", err);
        }

        // Then start the graph reaction simulation
        startSimulation();
      };

      initSimulation();
    }
  }, [featureText, agents.length, nodes.length, isSimulating, topicId]);

  const startSimulation = async () => {
    if (!featureText || agents.length === 0) return;

    // Clear feature text from sessionStorage now that we're using it
    sessionStorage.removeItem("crucible_feature_text");

    setIsSimulating(true);
    setSimStatus("Starting simulation...");
    setReactions([]);

    try {
      const response = await fetch(`${API_BASE}/stream-reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feature: featureText,
          agents: agents.map((a) => ({
            id: a.id,
            name: a.name,
            segment: a.segment,
            color: a.segment_color,
            traits: {
              patience: a.patience,
              tech_level: a.tech_level,
              price_sensitivity: a.price_sensitivity,
            },
          })),
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No reader");

      let buffer = "";

      // Process stream
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
                setReactions((prev) => [
                  ...prev,
                  {
                    agent_id: data.agent_id,
                    agent_name: data.agent_name,
                    segment: data.segment,
                    color: data.color,
                    sentiment: data.sentiment,
                    comment: data.comment,
                  },
                ]);

                setPulsingNodes((prev) => new Set(prev).add(data.agent_id));
                setTimeout(() => {
                  setPulsingNodes((prev) => {
                    const next = new Set(prev);
                    next.delete(data.agent_id);
                    return next;
                  });
                }, 1500);

                setNodes((prev) =>
                  prev.map((n) =>
                    n.id === data.agent_id
                      ? { ...n, sentiment: data.sentiment }
                      : n
                  )
                );

                setTimeout(() => {
                  activityFeedRef.current?.scrollTo({
                    top: activityFeedRef.current.scrollHeight,
                    behavior: "smooth",
                  });
                }, 50);

                setSimStatus(`${data.index}/${data.total} reactions`);
              } else if (data.type === "complete") {
                console.log("Graph simulation complete!", data.total_reactions, "reactions");
                setSimStatus(`Complete: ${data.total_reactions} reactions`);
                setIsSimulating(false);
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
  };

  const createForumTopic = async () => {
    console.log("createForumTopic called");
    setCreatingTopic(true);

    try {
      console.log("Calling createTopicWithPost...", { featureText, graphId, agentsCount: agents.length });
      const result = await createTopicWithPost(featureText, graphId, agents);
      console.log("createTopicWithPost result:", result);

      if (result.success && result.topic && result.post) {
        console.log("Forum topic created:", result.topic.id);
        setTopicId(result.topic.id);
        setTopicTitle(result.topic.name);

        // Store for navigation
        sessionStorage.setItem("crucible_topic_id", result.topic.id);

        // Start forum simulation
        setForumSimulating(true);
        setForumEvents([]);

        cleanupForumSim.current = streamLiveSimulation(
          result.topic.id,
          result.post.id,
          result.post.content,
          result.post.title,
          agents,
          {
            rounds: 40,
            delayMs: 1000,
            onEvent: (event) => {
              setForumEvents((prev) => [...prev, event]);

              if (event.type === "comment") {
                setForumStats((prev) => ({
                  ...prev,
                  comments: prev.comments + 1,
                }));
                if (event.agent_id) {
                  setPulsingNodes((prev) => new Set(prev).add(event.agent_id!));
                  setTimeout(() => {
                    setPulsingNodes((prev) => {
                      const next = new Set(prev);
                      next.delete(event.agent_id!);
                      return next;
                    });
                  }, 1500);
                }
              } else if (event.type === "reply") {
                setForumStats((prev) => ({
                  ...prev,
                  replies: prev.replies + 1,
                }));
              } else if (event.type === "vote") {
                setForumStats((prev) => ({
                  ...prev,
                  upvotes: prev.upvotes + 1,
                }));
              }
            },
            onComplete: () => {
              setForumSimulating(false);
            },
            onError: (err) => {
              console.error("Forum simulation error:", err);
              setForumSimulating(false);
            },
          }
        );
      }
    } catch (err) {
      console.error("Error creating topic:", err);
    } finally {
      setCreatingTopic(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex flex-col overflow-hidden bg-background">
        <TopNav />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-sage animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col overflow-hidden bg-background">
        <TopNav />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-curious mb-4">{error}</p>
            <button
              onClick={() => router.push("/graph")}
              className="text-sage hover:underline"
            >
              Back to Graph Builder
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <TopNav />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-[280px] bg-surface border-r border-border p-4 flex flex-col gap-4 overflow-y-auto">
          <div className="bg-sage-light/30 rounded-lg p-3 border border-sage/20">
            <h2 className="text-sm font-semibold text-sage-dark">
              {graphData?.project_name || "Graph"}
            </h2>
            <p className="text-xs text-text-muted mt-1">ID: {graphId}</p>
          </div>

          {/* Graph Stats */}
          <div className="bg-sage-light/20 rounded-lg p-3 border border-sage/10">
            <div className="text-[11px] font-semibold text-sage-dark uppercase tracking-wide mb-2">
              Graph Stats
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between">
                <span className="text-xs text-text-secondary">Nodes</span>
                <span className="text-sm font-semibold text-text">
                  {nodes.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-text-secondary">Edges</span>
                <span className="text-sm font-semibold text-text">
                  {links.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-text-secondary">Agents</span>
                <span className="text-sm font-semibold text-text">
                  {agents.length}
                </span>
              </div>
            </div>
          </div>

          {/* Agent Segments */}
          {agents.length > 0 && (
            <div className="bg-surface rounded-lg p-3 border border-border">
              <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-2">
                Agent Segments
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
                    style={{
                      backgroundColor:
                        SEGMENT_COLORS[segment as keyof typeof SEGMENT_COLORS] ||
                        "#8E8E93",
                    }}
                  >
                    {segment.replace("_", " ")}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Feature Input */}
          {agents.length > 0 && !isSimulating && reactions.length === 0 && (
            <div className="mt-auto">
              <label className="text-[11px] font-medium text-text-secondary mb-1 block">
                Test a Feature
              </label>
              <textarea
                value={featureText}
                onChange={(e) => setFeatureText(e.target.value)}
                placeholder="Describe a feature to test..."
                className="w-full text-xs p-2 rounded-lg border border-border bg-background h-20 resize-none focus:border-sage focus:outline-none"
              />
              <button
                onClick={startSimulation}
                disabled={!featureText}
                className="mt-2 w-full flex items-center justify-center gap-2 bg-sage text-white rounded-lg py-2.5 text-sm font-medium hover:bg-sage-dark transition-colors disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                Run Simulation
              </button>
            </div>
          )}

          {/* Go to Forum */}
          {topicId && (
            <div className="mt-auto space-y-2">
              {topicTitle && (
                <div className="text-xs text-text-secondary text-center truncate px-2">
                  📝 {topicTitle}
                </div>
              )}
              <button
                onClick={() => router.push(`/forum/${topicId}`)}
                className="w-full flex items-center justify-center gap-2 bg-sage text-white rounded-lg py-2.5 text-sm font-medium hover:bg-sage-dark transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                {forumSimulating ? "Watch Live Discussion →" : "Open Forum →"}
              </button>
            </div>
          )}
        </div>

        {/* Main Graph Area */}
        <div className="flex-1 relative bg-background">
          {nodes.length > 0 ? (
            <D3ForceGraph
              nodes={nodes}
              links={links}
              onNodeClick={() => {}}
              pulsingNodes={pulsingNodes}
              staticMode={true}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-text-muted">
              No nodes to display
            </div>
          )}

          {/* Simulation Status Overlay */}
          {isSimulating && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-surface rounded-xl border border-sage/20 shadow-lg p-4 w-[340px]">
              <div className="flex items-center gap-3 mb-3">
                <div className="relative">
                  <Sparkles className="w-5 h-5 text-sage" />
                  <div className="absolute inset-0 animate-ping">
                    <Sparkles className="w-5 h-5 text-sage opacity-30" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-text">
                    Simulating Reactions
                  </div>
                  <div className="text-xs text-text-muted">{simStatus}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Activity Feed */}
        {showActivity && (reactions.length > 0 || isSimulating || forumSimulating) && (
          <div className="w-[320px] bg-surface border-l border-border flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border bg-sage-light/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-sage" />
                  <span className="text-sm font-semibold text-sage-dark">
                    {forumSimulating ? "Live Forum" : "Live Reactions"}
                  </span>
                </div>
                {(isSimulating || forumSimulating) && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-sage rounded-full animate-pulse" />
                    <span className="text-[10px] text-text-muted">
                      {forumSimulating
                        ? `${forumStats.comments} comments`
                        : simStatus}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div
              ref={activityFeedRef}
              className="flex-1 overflow-y-auto p-3 space-y-2"
            >
              {reactions.map((reaction, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg bg-background border border-border animate-in slide-in-from-right duration-300"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-semibold"
                      style={{ backgroundColor: reaction.color }}
                    >
                      {reaction.agent_name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-text truncate">
                        {reaction.agent_name}
                      </div>
                      <div className="text-[10px] text-sage">
                        {reaction.segment.replace("_", " ")}
                      </div>
                    </div>
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        reaction.sentiment === "positive"
                          ? "bg-sage"
                          : reaction.sentiment === "negative"
                          ? "bg-curious"
                          : "bg-text-muted"
                      }`}
                    />
                  </div>
                  <p className="text-sm text-text leading-relaxed">
                    "{reaction.comment}"
                  </p>
                </div>
              ))}

              {forumEvents
                .filter((e) => e.type === "comment" || e.type === "reply")
                .map((event, i) => (
                  <div
                    key={`forum-${i}`}
                    className="p-3 rounded-lg bg-sage-light/30 border border-sage/20 animate-in slide-in-from-right duration-300"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-semibold"
                        style={{
                          backgroundColor: event.segment_color || "#7C9070",
                        }}
                      >
                        {event.agent_name
                          ?.split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-text truncate">
                          {event.agent_name}
                        </div>
                        <div className="text-[10px] text-sage">
                          {event.type === "reply" ? "replying" : "commenting"}
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-text leading-relaxed">
                      "{event.content}"
                    </p>
                  </div>
                ))}
            </div>

            {/* Go to Forum Button */}
            {topicId && !isSimulating && (
              <div className="p-3 border-t border-border">
                <button
                  onClick={() => router.push(`/forum/${topicId}`)}
                  className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors bg-sage text-white hover:bg-sage-dark"
                >
                  <MessageSquare className="w-4 h-4" />
                  {forumSimulating ? "Watch Live Discussion" : "Open Forum"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
