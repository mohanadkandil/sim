"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import TopNav from "@/components/TopNav";
import D3ForceGraph from "@/components/graph/D3ForceGraph";
import { Loader2, MessageSquare, Sparkles, Play, ArrowUp, ArrowDown, ThumbsUp, ThumbsDown, ChevronRight } from "lucide-react";
import {
  ForumAgent,
  createTopicWithPost,
  streamLiveSimulation,
  LiveSimulationEvent,
  SEGMENT_COLORS,
  SEGMENT_LABELS,
  suggestRevision,
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

interface LocalComment {
  id: string;
  authorName: string;
  segment: string;
  segmentColor: string;
  content: string;
  sentiment: "positive" | "neutral" | "negative";
  replies: LocalComment[];
}

export default function GraphDetailPage() {
  const params = useParams();
  const router = useRouter();
  const graphId = params.graphId as string;

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

  // Topic state — restored from sessionStorage so Forum tab works after refresh
  const [topicId, setTopicId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem("crucible_topic_id");
  });
  const [topicTitle, setTopicTitle] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      const topic = sessionStorage.getItem("crucible_topic");
      return topic ? JSON.parse(topic).name ?? "" : "";
    } catch { return ""; }
  });
  const [creatingTopic, setCreatingTopic] = useState(false);

  // Forum simulation state
  const [forumSimulating, setForumSimulating] = useState(false);
  const [forumEvents, setForumEvents] = useState<LiveSimulationEvent[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = sessionStorage.getItem("crucible_forum_events");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [forumStats, setForumStats] = useState({
    comments: 0,
    replies: 0,
    upvotes: 0,
  });
  const cleanupForumSim = useRef<(() => void) | null>(null);

  // Persist forum events to sessionStorage whenever they change
  useEffect(() => {
    if (forumEvents.length > 0) {
      sessionStorage.setItem("crucible_forum_events", JSON.stringify(forumEvents));
    }
    // Auto-scroll forum panel
    setTimeout(() => {
      activityFeedRef.current?.scrollTo({ top: activityFeedRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
  }, [forumEvents]);

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
        // crucible_feature_text is removed when sim starts; crucible_last_feature persists across refreshes
        const storedFeature =
          sessionStorage.getItem("crucible_feature_text") ||
          sessionStorage.getItem("crucible_last_feature");
        if (storedFeature) {
          setFeatureText(storedFeature);
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

  const startSimulation = async (overrideText?: string) => {
    const text = overrideText ?? featureText;
    if (!text || agents.length === 0) return;

    sessionStorage.removeItem("crucible_feature_text");
    sessionStorage.setItem("crucible_last_feature", text);
    setFeatureText(text);
    setShowDetails(true); // show live graph while simulation runs

    setIsSimulating(true);
    setSimStatus("Starting simulation...");
    setReactions([]);

    try {
      const response = await fetch(`${API_BASE}/stream-reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feature: text,
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
              setShowDetails(false); // snap to summary view
            },
            onError: (err) => {
              console.error("Forum simulation error:", err);
              setForumSimulating(false);
              setShowDetails(false);
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

  // Build threaded comment tree from raw forum events
  const commentThreads = useMemo<LocalComment[]>(() => {
    const roots: LocalComment[] = [];
    const map = new Map<string, LocalComment>();
    forumEvents.forEach((event) => {
      if ((event.type === "comment" || event.type === "reply") && event.content) {
        const node: LocalComment = {
          id: event.id || `${event.type}_${Math.random()}`,
          authorName: event.agent_name || "Unknown",
          segment: event.segment || "casual",
          segmentColor: event.segment_color || "#7C9070",
          content: event.content,
          sentiment: (event.sentiment as "positive" | "neutral" | "negative") || "neutral",
          replies: [],
        };
        if (event.id) map.set(event.id, node);
        if (event.type === "reply" && event.parent_id) {
          const parent = map.get(event.parent_id);
          if (parent) { parent.replies.push(node); return; }
        }
        roots.push(node);
      }
    });
    return roots;
  }, [forumEvents]);

  const sentimentCounts = useMemo(() => {
    const counts = { positive: 0, negative: 0, neutral: 0, total: 0 };
    // Include reactions in sentiment count too
    reactions.forEach((r) => {
      counts.total++;
      if (r.sentiment === "positive") counts.positive++;
      else if (r.sentiment === "negative") counts.negative++;
      else counts.neutral++;
    });
    forumEvents.forEach((e) => {
      if (e.type === "comment" || e.type === "reply") {
        counts.total++;
        if (e.sentiment === "positive") counts.positive++;
        else if (e.sentiment === "negative") counts.negative++;
        else counts.neutral++;
      }
    });
    return counts;
  }, [forumEvents, reactions]);

  const adoptionScore = useMemo(() => {
    if (sentimentCounts.total === 0) return null;
    return Math.round(
      (sentimentCounts.positive + sentimentCounts.neutral * 0.5) / sentimentCounts.total * 100
    );
  }, [sentimentCounts]);

  const resetSimulation = () => {
    setShowDetails(false);
    setReactions([]);
    setForumEvents([]);
    setForumStats({ comments: 0, replies: 0, upvotes: 0 });
    setTopicId(null);
    setTopicTitle("");
    setFeatureText("");
    setIsSimulating(false);
    setForumSimulating(false);
    sessionStorage.removeItem("crucible_forum_events");
    sessionStorage.removeItem("crucible_topic_id");
    sessionStorage.removeItem("crucible_topic");
    sessionStorage.removeItem("crucible_post");
    sessionStorage.removeItem("crucible_last_feature");
  };

  const [showDetails, setShowDetails] = useState(false);
  const [suggestingRevision, setSuggestingRevision] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

  const handleSuggestRevision = async () => {
    if (!featureText.trim()) {
      setSuggestionError("No feature text to revise — type a description first.");
      return;
    }
    setSuggestingRevision(true);
    setSuggestionError(null);
    try {
      const result = await suggestRevision(featureText, reactions, forumEvents);
      if (result.success && result.suggestion) {
        setFeatureText(result.suggestion);
      } else {
        setSuggestionError(result.error || "Suggestion failed — try again.");
      }
    } catch (e) {
      setSuggestionError("Could not reach the backend. Is the server running?");
    } finally {
      setSuggestingRevision(false);
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

          {/* Feature Input — always visible when agents loaded */}
          {agents.length > 0 && (
            <div className="mt-auto flex flex-col gap-2">
              {(!isSimulating && !forumSimulating) && (
                <>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-medium text-text-secondary">
                      {reactions.length > 0 || forumEvents.length > 0 ? "Revise & retest" : "Test a Feature"}
                    </label>
                    {(reactions.length > 0 || forumEvents.length > 0) && (
                      <button
                        onClick={resetSimulation}
                        className="text-[10px] text-text-muted hover:text-sage transition-colors"
                      >
                        clear
                      </button>
                    )}
                  </div>

                  {/* Suggest revision button — shown after a simulation */}
                  {(reactions.length > 0 || forumEvents.length > 0) && (
                    <>
                      <button
                        onClick={handleSuggestRevision}
                        disabled={suggestingRevision}
                        className="w-full flex items-center justify-center gap-1.5 text-xs border border-sage/40 text-sage rounded-lg py-2 hover:bg-sage-light/40 transition-colors disabled:opacity-50"
                      >
                        {suggestingRevision ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing feedback...</>
                        ) : (
                          <><Sparkles className="w-3.5 h-3.5" /> Suggest revision from feedback</>
                        )}
                      </button>
                      {suggestionError && (
                        <p className="text-[10px] text-curious leading-snug">{suggestionError}</p>
                      )}
                    </>
                  )}

                  <textarea
                    value={featureText}
                    onChange={(e) => setFeatureText(e.target.value)}
                    placeholder="Describe a feature to test..."
                    className="w-full text-xs p-2 rounded-lg border border-border bg-background h-24 resize-none focus:border-sage focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      const t = featureText;
                      resetSimulation();
                      startSimulation(t);
                    }}
                    disabled={!featureText}
                    className="w-full flex items-center justify-center gap-2 bg-sage text-white rounded-lg py-2.5 text-sm font-medium hover:bg-sage-dark transition-colors disabled:opacity-50"
                  >
                    <Play className="w-4 h-4" />
                    Run Simulation
                  </button>
                </>
              )}
              {(isSimulating || forumSimulating) && topicTitle && (
                <div className="text-xs text-text-secondary bg-sage-light/30 rounded-lg px-3 py-2 border border-sage/20 truncate">
                  📝 {topicTitle}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Summary view — shown when results are ready and details not expanded */}
        {!showDetails && !isSimulating && !forumSimulating && (reactions.length > 0 || forumEvents.length > 0) ? (
          <ResultsSummary
            featureText={featureText}
            adoptionScore={adoptionScore}
            sentimentCounts={sentimentCounts}
            reactions={reactions}
            forumEvents={forumEvents}
            agents={agents}
            onViewDetails={() => setShowDetails(true)}
            onSuggestRevision={handleSuggestRevision}
            suggestingRevision={suggestingRevision}
            suggestionError={suggestionError}
          />
        ) : (
          <>
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
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Sparkles className="w-5 h-5 text-sage" />
                      <div className="absolute inset-0 animate-ping">
                        <Sparkles className="w-5 h-5 text-sage opacity-30" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-text">Simulating Reactions</div>
                      <div className="text-xs text-text-muted">{simStatus}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Forum Panel — always visible once agents are loaded */}
        {agents.length > 0 && (
          <div className="w-[400px] bg-surface border-l border-border flex flex-col overflow-hidden">

            {/* Panel header */}
            <div className="p-4 border-b border-border bg-sage-light/30 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-sage" />
                  <span className="text-sm font-semibold text-sage-dark truncate max-w-[200px]">
                    {topicTitle || "Discussion"}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {adoptionScore !== null && (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      adoptionScore >= 65 ? "bg-sage/20 text-sage-dark" :
                      adoptionScore >= 40 ? "bg-amber-100 text-amber-700" :
                      "bg-curious/10 text-curious"
                    }`}>
                      {adoptionScore}% adoption
                    </span>
                  )}
                  {(forumSimulating || isSimulating) && (
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-sage rounded-full animate-pulse" />
                      <span className="text-[10px] text-text-muted">live</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Sentiment bar */}
              {sentimentCounts.total > 0 && (
                <div className="mt-3">
                  <div className="flex rounded-full overflow-hidden h-2">
                    <div className="bg-sage transition-all duration-500" style={{ width: `${Math.round(sentimentCounts.positive / sentimentCounts.total * 100)}%` }} />
                    <div className="bg-text-muted/30 transition-all duration-500" style={{ width: `${Math.round(sentimentCounts.neutral / sentimentCounts.total * 100)}%` }} />
                    <div className="bg-curious transition-all duration-500" style={{ width: `${Math.round(sentimentCounts.negative / sentimentCounts.total * 100)}%` }} />
                  </div>
                  <div className="flex justify-between mt-1.5 text-[10px] text-text-muted">
                    <span className="text-sage">{Math.round(sentimentCounts.positive / sentimentCounts.total * 100)}% positive</span>
                    <span>{sentimentCounts.total} responses</span>
                    <span className="text-curious">{Math.round(sentimentCounts.negative / sentimentCounts.total * 100)}% negative</span>
                  </div>
                </div>
              )}
            </div>

            {/* Feature post */}
            {(topicTitle || featureText) && (reactions.length > 0 || forumEvents.length > 0 || isSimulating || forumSimulating) && (
              <div className="shrink-0 border-b border-border bg-background px-4 py-3">
                <div className="flex gap-3">
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    <button className="text-text-muted hover:text-sage transition-colors"><ArrowUp className="w-4 h-4" /></button>
                    <span className="text-xs font-semibold text-sage">1</span>
                    <button className="text-text-muted hover:text-curious transition-colors"><ArrowDown className="w-4 h-4" /></button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-medium text-sage bg-sage-light/60 px-1.5 py-0.5 rounded">Feature Proposal</span>
                      <span className="text-[10px] text-text-muted">by Product Team</span>
                    </div>
                    <p className="text-xs text-text leading-relaxed line-clamp-3">{topicTitle || featureText}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Scrollable content */}
            <div ref={activityFeedRef} className="flex-1 overflow-y-auto p-3 space-y-3">

              {/* Empty state */}
              {reactions.length === 0 && forumEvents.length === 0 && !isSimulating && !forumSimulating && (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-12 text-center">
                  <MessageSquare className="w-10 h-10 text-border" />
                  <p className="text-sm text-text-muted">No discussion yet.</p>
                  <p className="text-xs text-text-muted">Enter a feature in the sidebar and run a simulation.</p>
                </div>
              )}

              {/* Loading state */}
              {reactions.length === 0 && forumEvents.length === 0 && (isSimulating || forumSimulating) && (
                <div className="flex items-center gap-2 py-8 justify-center text-text-muted">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs">Agents are responding...</span>
                </div>
              )}

              {/* Initial quick reactions — always shown */}
              {reactions.map((reaction, i) => (
                <ReactionCard key={i} reaction={reaction} />
              ))}

              {/* Threaded forum discussion */}
              {commentThreads.map((comment, i) => (
                <CommentNode key={comment.id || i} comment={comment} depth={0} />
              ))}
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

function ResultsSummary({
  featureText, adoptionScore, sentimentCounts, reactions, forumEvents, agents,
  onViewDetails, onSuggestRevision, suggestingRevision, suggestionError,
}: {
  featureText: string;
  adoptionScore: number | null;
  sentimentCounts: { positive: number; negative: number; neutral: number; total: number };
  reactions: Array<{ agent_id: string; agent_name: string; segment: string; color: string; sentiment: string; comment: string }>;
  forumEvents: LiveSimulationEvent[];
  agents: ForumAgent[];
  onViewDetails: () => void;
  onSuggestRevision: () => void;
  suggestingRevision: boolean;
  suggestionError: string | null;
}) {
  const score = adoptionScore ?? 0;
  const thumbsUp = score >= 50;

  // Per-segment adoption score
  const segmentScores = Object.entries(
    reactions.reduce((acc, r) => {
      if (!acc[r.segment]) acc[r.segment] = { pos: 0, total: 0 };
      acc[r.segment].total++;
      if (r.sentiment === "positive") acc[r.segment].pos++;
      else if (r.sentiment === "neutral") acc[r.segment].pos += 0.5;
      return acc;
    }, {} as Record<string, { pos: number; total: number }>)
  ).map(([segment, { pos, total }]) => ({
    segment,
    score: Math.round((pos / total) * 100),
    color: SEGMENT_COLORS[segment as keyof typeof SEGMENT_COLORS] || "#8E8E93",
  })).sort((a, b) => b.score - a.score);

  // Pick one highlight quote per sentiment
  const allFeedback = [
    ...reactions.map(r => ({ sentiment: r.sentiment, text: r.comment, name: r.agent_name, segment: r.segment, color: r.color })),
    ...forumEvents.filter(e => e.type === "comment").map(e => ({
      sentiment: e.sentiment || "neutral", text: e.content || "", name: e.agent_name || "",
      segment: e.segment || "", color: e.segment_color || "#7C9070",
    })),
  ];
  const topPositive = allFeedback.find(f => f.sentiment === "positive");
  const topNegative = allFeedback.find(f => f.sentiment === "negative");

  return (
    <div className="flex-1 overflow-y-auto bg-background flex items-start justify-center py-12 px-8">
      <div className="w-full max-w-[560px] flex flex-col gap-8">

        {/* Feature label */}
        {featureText && (
          <p className="text-sm text-text-muted text-center line-clamp-2 px-4">{featureText}</p>
        )}

        {/* Verdict */}
        <div className="flex flex-col items-center gap-3">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center ${thumbsUp ? "bg-sage/10" : "bg-curious/10"}`}>
            {thumbsUp
              ? <ThumbsUp className="w-10 h-10 text-sage" />
              : <ThumbsDown className="w-10 h-10 text-curious" />
            }
          </div>
          <div className="text-center">
            <div className="text-6xl font-bold tracking-tight" style={{ color: thumbsUp ? "#7C9070" : "#D4845E" }}>
              {score}%
            </div>
            <div className="text-sm text-text-muted mt-1">adoption rate · {sentimentCounts.total} responses</div>
          </div>
        </div>

        {/* Sentiment bar */}
        {sentimentCounts.total > 0 && (
          <div>
            <div className="flex rounded-full overflow-hidden h-3">
              <div className="bg-sage transition-all" style={{ width: `${Math.round(sentimentCounts.positive / sentimentCounts.total * 100)}%` }} />
              <div className="bg-text-muted/25 transition-all" style={{ width: `${Math.round(sentimentCounts.neutral / sentimentCounts.total * 100)}%` }} />
              <div className="bg-curious transition-all" style={{ width: `${Math.round(sentimentCounts.negative / sentimentCounts.total * 100)}%` }} />
            </div>
            <div className="flex justify-between mt-1.5 text-xs text-text-muted">
              <span className="text-sage">{Math.round(sentimentCounts.positive / sentimentCounts.total * 100)}% positive</span>
              <span className="text-curious">{Math.round(sentimentCounts.negative / sentimentCounts.total * 100)}% negative</span>
            </div>
          </div>
        )}

        {/* Segment breakdown */}
        {segmentScores.length > 0 && (
          <div className="bg-surface rounded-xl border border-border p-4 flex flex-col gap-3">
            <p className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">By segment</p>
            {segmentScores.map(({ segment, score: s, color }) => (
              <div key={segment} className="flex items-center gap-3">
                <span className="text-xs text-text w-24 shrink-0 capitalize">{segment.replace("_", " ")}</span>
                <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${s}%`, backgroundColor: color }} />
                </div>
                <span className="text-xs font-semibold w-9 text-right" style={{ color }}>{s}%</span>
              </div>
            ))}
          </div>
        )}

        {/* Top quotes */}
        {(topPositive || topNegative) && (
          <div className="flex flex-col gap-3">
            {topPositive && (
              <div className="bg-sage/5 border border-sage/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ backgroundColor: topPositive.color }}>
                    {topPositive.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </div>
                  <span className="text-xs font-medium text-text">{topPositive.name}</span>
                  <span className="text-[10px] text-sage">· {topPositive.segment.replace("_", " ")}</span>
                </div>
                <p className="text-sm text-text leading-relaxed">"{topPositive.text}"</p>
              </div>
            )}
            {topNegative && (
              <div className="bg-curious/5 border border-curious/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ backgroundColor: topNegative.color }}>
                    {topNegative.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </div>
                  <span className="text-xs font-medium text-text">{topNegative.name}</span>
                  <span className="text-[10px] text-curious">· {topNegative.segment.replace("_", " ")}</span>
                </div>
                <p className="text-sm text-text leading-relaxed">"{topNegative.text}"</p>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={onSuggestRevision}
            disabled={suggestingRevision}
            className="w-full flex items-center justify-center gap-2 border border-sage/40 text-sage rounded-xl py-3 text-sm font-medium hover:bg-sage-light/40 transition-colors disabled:opacity-50"
          >
            {suggestingRevision
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing feedback...</>
              : <><Sparkles className="w-4 h-4" /> Suggest revision from feedback</>
            }
          </button>
          {suggestionError && <p className="text-xs text-curious text-center">{suggestionError}</p>}
          <button
            onClick={onViewDetails}
            className="w-full flex items-center justify-center gap-2 text-text-secondary text-sm rounded-xl py-3 hover:bg-surface transition-colors"
          >
            View graph & discussion <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
}

function ReactionCard({ reaction }: {
  reaction: { agent_name: string; segment: string; color: string; sentiment: string; comment: string };
}) {
  const [votes, setVotes] = useState(Math.floor(Math.random() * 12) + 1);
  return (
    <div className="p-3 rounded-lg bg-background border border-border animate-in slide-in-from-right duration-300">
      <div className="flex gap-2.5">
        <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
          <button onClick={() => setVotes(v => v + 1)} className="text-text-muted hover:text-sage transition-colors"><ArrowUp className="w-3.5 h-3.5" /></button>
          <span className={`text-[10px] font-semibold ${votes > 0 ? "text-sage" : "text-text-muted"}`}>{votes}</span>
          <button onClick={() => setVotes(v => v - 1)} className="text-text-muted hover:text-curious transition-colors"><ArrowDown className="w-3.5 h-3.5" /></button>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0" style={{ backgroundColor: reaction.color }}>
              {reaction.agent_name.split(" ").map((n) => n[0]).join("")}
            </div>
            <span className="text-xs font-semibold text-text">{reaction.agent_name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: SEGMENT_COLORS[reaction.segment as keyof typeof SEGMENT_COLORS] || "#8E8E93" }}>
              {reaction.segment.replace("_", " ")}
            </span>
            <div className={`w-2 h-2 rounded-full ${reaction.sentiment === "positive" ? "bg-sage" : reaction.sentiment === "negative" ? "bg-curious" : "bg-text-muted/50"}`} />
          </div>
          <p className="text-xs text-text leading-relaxed">{reaction.comment}</p>
        </div>
      </div>
    </div>
  );
}

function CommentNode({ comment, depth }: { comment: LocalComment; depth: number }) {
  const [votes, setVotes] = useState(Math.floor(Math.random() * 18) + 1);
  const initials = comment.authorName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className={`animate-in slide-in-from-right duration-300 ${depth > 0 ? "ml-5 border-l-2 border-border pl-3" : ""}`}>
      <div className={`rounded-lg border p-3 ${depth === 0 ? "bg-background border-border" : "bg-surface border-border/50"}`}>
        <div className="flex gap-2.5">
          {/* Vote column */}
          <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
            <button onClick={() => setVotes(v => v + 1)} className="text-text-muted hover:text-sage transition-colors">
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <span className={`text-[10px] font-semibold ${votes > 0 ? "text-sage" : "text-text-muted"}`}>{votes}</span>
            <button onClick={() => setVotes(v => v - 1)} className="text-text-muted hover:text-curious transition-colors">
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                style={{ backgroundColor: comment.segmentColor }}
              >
                {initials}
              </div>
              <span className="text-xs font-semibold text-text">{comment.authorName}</span>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded text-white leading-none"
                style={{ backgroundColor: comment.segmentColor }}
              >
                {SEGMENT_LABELS[comment.segment as keyof typeof SEGMENT_LABELS] || comment.segment.replace("_", " ")}
              </span>
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${
                  comment.sentiment === "positive" ? "bg-sage" :
                  comment.sentiment === "negative" ? "bg-curious" : "bg-text-muted/50"
                }`}
              />
            </div>
            <p className="text-xs text-text leading-relaxed">{comment.content}</p>
          </div>
        </div>
      </div>

      {/* Nested replies */}
      {comment.replies.length > 0 && (
        <div className="mt-2 space-y-2">
          {comment.replies.map((reply, i) => (
            <CommentNode key={reply.id || i} comment={reply} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
