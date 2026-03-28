"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowUp,
  ArrowDown,
  MessageSquare,
  Share,
  TrendingUp,
  Clock,
  Flame,
  Loader2,
  Users,
  RefreshCw,
} from "lucide-react";
import TopNav from "@/components/TopNav";
import { useActivity } from "@/lib/activity-context";
import {
  ForumAgent,
  Topic,
  getTopic,
  getSimulationStatus,
  streamSimulationUpdates,
  startSimulation,
  LiveSimulationEvent,
  SEGMENT_COLORS,
  SEGMENT_LABELS,
} from "@/lib/forum-api";

interface LocalComment {
  id: string;
  authorId: string;
  authorName: string;
  avatar: string;
  segment: string;
  content: string;
  upvotes: number;
  downvotes: number;
  sentiment: "positive" | "neutral" | "negative";
  timestamp: string;
  replies: LocalComment[];
}

interface LocalPost {
  id: string;
  topic_id: string;
  subreddit: string;
  authorId: string;
  authorName: string;
  avatar: string;
  title: string;
  content: string;
  upvotes: number;
  downvotes: number;
  commentCount: number;
  timestamp: string;
  comments: LocalComment[];
  flair?: string;
}

export default function ForumTopicPage() {
  const params = useParams();
  const router = useRouter();
  const topicId = params.topicId as string;
  const { showActivity, setActivityCount } = useActivity();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [agents, setAgents] = useState<ForumAgent[]>([]);
  const [posts, setPosts] = useState<LocalPost[]>([]);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"hot" | "new" | "top">("hot");

  const [isSimulating, setIsSimulating] = useState(false);
  const [simProgress, setSimProgress] = useState(0);
  const [stats, setStats] = useState({
    totalComments: 0,
    positiveCount: 0,
    negativeCount: 0,
    neutralCount: 0,
  });
  const [adoptionScore, setAdoptionScore] = useState(50);
  const [liveEvents, setLiveEvents] = useState<Array<{
    id: string;
    type: string;
    agentName: string;
    segment: string;
    content: string;
    timestamp: Date;
  }>>([]);

  const cleanupStream = useRef<(() => void) | null>(null);
  const activityRef = useRef<HTMLDivElement>(null);

  // Sync activity count with live events
  useEffect(() => {
    setActivityCount(liveEvents.length);
  }, [liveEvents.length, setActivityCount]);

  // Load topic data from backend
  useEffect(() => {
    if (!topicId) return;

    const loadTopic = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await getTopic(topicId);

        if (!result.success) {
          setError(result.error || "Topic not found");
          setLoading(false);
          return;
        }

        setTopic(result.topic || null);
        setAgents(result.agents || []);

        // Convert backend posts to local format
        const backendPosts = result.posts || [];
        const localPosts: LocalPost[] = backendPosts.map((p: any) => ({
          id: p.id,
          topic_id: p.topic_id,
          subreddit: result.topic?.subreddit?.replace("r/", "") || "",
          authorId: "pm",
          authorName: p.author || "Product Team",
          avatar: "PT",
          title: p.title || "Feature Proposal",
          content: p.content || "",
          upvotes: p.upvotes || 1,
          downvotes: p.downvotes || 0,
          commentCount: p.comments?.length || 0,
          timestamp: "just now",
          comments: (p.comments || []).map((c: any) => convertComment(c)),
          flair: "Feature Proposal",
        }));

        setPosts(localPosts);
        if (localPosts.length > 0) {
          setExpandedPost(localPosts[0].id);
        }

        // Check simulation status
        const simStatus = result.simulation;
        if (simStatus) {
          if (simStatus.status === "running") {
            setIsSimulating(true);
            setSimProgress(simStatus.progress || 0);
            // Connect to stream for live updates
            connectToStream();
          } else if (simStatus.status === "completed") {
            // Load final comments
            updateCommentsFromSimulation(simStatus.comments || []);
          } else if (simStatus.status === "not_started" && result.agents && result.agents.length > 0 && localPosts.length > 0) {
            // Auto-start simulation if not started
            startBackgroundSimulation(localPosts[0]);
          }
        }
      } catch (err) {
        console.error("Error loading topic:", err);
        setError("Failed to load topic");
      } finally {
        setLoading(false);
      }
    };

    loadTopic();

    return () => {
      cleanupStream.current?.();
    };
  }, [topicId]);

  const convertComment = (c: any): LocalComment => ({
    id: c.id || `comment_${Math.random().toString(36).slice(2)}`,
    authorId: c.agent_id || "",
    authorName: c.agent_name || "Unknown",
    avatar: c.agent_name?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) || "??",
    segment: c.segment || "casual",
    content: c.content || "",
    upvotes: c.upvotes || Math.floor(Math.random() * 20) + 1,
    downvotes: c.downvotes || Math.floor(Math.random() * 5),
    sentiment: c.sentiment || "neutral",
    timestamp: "just now",
    replies: [],
  });

  const updateCommentsFromSimulation = (comments: any[]) => {
    const topLevelComments: LocalComment[] = [];
    const replies: { parentId: string; reply: LocalComment }[] = [];

    comments.forEach((c) => {
      const comment = convertComment(c);
      if (c.parent_id) {
        replies.push({ parentId: c.parent_id, reply: comment });
      } else {
        topLevelComments.push(comment);
      }
    });

    // Attach replies
    replies.forEach(({ parentId, reply }) => {
      const parent = topLevelComments.find((c) => c.id === parentId);
      if (parent) {
        parent.replies.push(reply);
      }
    });

    // Update posts with comments
    setPosts((prev) =>
      prev.map((p, i) =>
        i === 0
          ? { ...p, comments: topLevelComments, commentCount: comments.length }
          : p
      )
    );

    // Update stats
    const positive = comments.filter((c) => c.sentiment === "positive").length;
    const negative = comments.filter((c) => c.sentiment === "negative").length;
    const neutral = comments.filter((c) => c.sentiment === "neutral").length;
    setStats({
      totalComments: comments.length,
      positiveCount: positive,
      negativeCount: negative,
      neutralCount: neutral,
    });
  };

  const connectToStream = () => {
    cleanupStream.current?.();

    cleanupStream.current = streamSimulationUpdates(
      topicId,
      (event) => {
        if (event.type === "comment" || event.type === "reply") {
          const newComment = convertComment(event);

          // Add to live events feed
          setLiveEvents((prev) => [
            {
              id: `event_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              type: event.type,
              agentName: event.agent_name || "Unknown",
              segment: event.segment || "casual",
              content: event.content || "",
              timestamp: new Date(),
            },
            ...prev,
          ].slice(0, 50)); // Keep last 50 events

          // Auto-scroll activity panel
          setTimeout(() => {
            activityRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          }, 50);

          setPosts((prev) =>
            prev.map((p, i) => {
              if (i !== 0) return p;

              if (event.type === "reply" && event.parent_id) {
                return {
                  ...p,
                  comments: p.comments.map((c) =>
                    c.id === event.parent_id
                      ? { ...c, replies: [...c.replies, newComment] }
                      : c
                  ),
                  commentCount: p.commentCount + 1,
                };
              }

              return {
                ...p,
                comments: [...p.comments, newComment],
                commentCount: p.commentCount + 1,
              };
            })
          );

          setStats((prev) => ({
            ...prev,
            totalComments: prev.totalComments + 1,
            positiveCount: prev.positiveCount + (event.sentiment === "positive" ? 1 : 0),
            negativeCount: prev.negativeCount + (event.sentiment === "negative" ? 1 : 0),
            neutralCount: prev.neutralCount + (event.sentiment === "neutral" ? 1 : 0),
          }));
        } else if (event.type === "status") {
          setSimProgress(event.progress || 0);
        } else if (event.type === "vote") {
          // Add vote event to live feed
          setLiveEvents((prev) => [
            {
              id: `event_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              type: event.vote_type || "upvote",
              agentName: event.agent_name || "Unknown",
              segment: event.segment || "casual",
              content: event.vote_type === "downvote" ? "downvoted" : "upvoted",
              timestamp: new Date(),
            },
            ...prev,
          ].slice(0, 50));
        }
      },
      (finalStats, score) => {
        setIsSimulating(false);
        setAdoptionScore(score);
      },
      (err) => {
        console.error("Stream error:", err);
        setIsSimulating(false);
      }
    );
  };

  const startBackgroundSimulation = async (post: LocalPost) => {
    if (!topic || agents.length === 0) return;

    setIsSimulating(true);

    const result = await startSimulation(
      topicId,
      post.id,
      agents,
      post.content,
      post.title,
      40
    );

    if (result.success) {
      // Connect to stream
      setTimeout(() => connectToStream(), 500);
    } else {
      setIsSimulating(false);
    }
  };

  const calculateAdoptionScore = () => {
    const total = stats.positiveCount + stats.negativeCount + stats.neutralCount;
    if (total === 0) return adoptionScore;
    return Math.round(
      ((stats.positiveCount + stats.neutralCount * 0.5) / total) * 100
    );
  };

  const handleVote = (postId: string, type: "up" | "down") => {
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? {
              ...post,
              upvotes: type === "up" ? post.upvotes + 1 : post.upvotes,
              downvotes: type === "down" ? post.downvotes + 1 : post.downvotes,
            }
          : post
      )
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <TopNav />
        <div className="flex items-center justify-center h-[calc(100vh-60px)]">
          <Loader2 className="w-8 h-8 animate-spin text-sage" />
        </div>
      </div>
    );
  }

  if (error || !topic) {
    return (
      <div className="min-h-screen bg-background">
        <TopNav />
        <div className="flex items-center justify-center h-[calc(100vh-60px)]">
          <div className="text-center">
            <MessageSquare className="w-16 h-16 mx-auto mb-4 text-text-muted" />
            <h2 className="text-xl font-semibold text-text mb-2">
              {error || "Topic not found"}
            </h2>
            <button
              onClick={() => router.push("/forum")}
              className="text-sage hover:underline"
            >
              Go to Forum
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <TopNav />

      <div className="flex-1 flex max-w-[1200px] mx-auto pt-6 px-6 gap-6 overflow-hidden">
        {/* Sidebar */}
        <div className="w-[260px] shrink-0 flex flex-col gap-4 overflow-y-auto pb-6">
          {/* Topic Info */}
          <div className="bg-sage-light/30 rounded-[12px] border border-sage/20 p-4">
            <button
              onClick={() => router.push("/forum")}
              className="text-xs text-sage hover:text-sage-dark mb-2 flex items-center gap-1"
            >
              ← All Topics
            </button>
            <h2 className="text-lg font-semibold text-sage-dark">{topic.subreddit}</h2>
            <p className="text-sm text-text-secondary mt-1">{topic.description}</p>
            <div className="text-xs text-sage mt-2 font-medium">
              {agents.length} agents participating
            </div>
          </div>

          {/* Simulation Status */}
          {isSimulating && (
            <div className="bg-sage-light rounded-[12px] border border-sage/20 p-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-sage animate-pulse" />
                <span className="text-sm text-sage-dark font-medium">
                  Agents discussing...
                </span>
              </div>
              <div className="mt-2">
                <div className="w-full bg-sage/20 rounded-full h-2">
                  <div
                    className="bg-sage h-2 rounded-full transition-all duration-500"
                    style={{ width: `${simProgress}%` }}
                  />
                </div>
                <div className="text-xs text-sage-dark/70 mt-1">
                  {stats.totalComments} comments • {simProgress}%
                </div>
              </div>
            </div>
          )}

          {/* Agent Pool */}
          <div className="bg-surface rounded-[12px] border border-border p-4">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
              Agent Pool
            </h3>
            <div className="space-y-2">
              {Object.entries(
                agents.reduce((acc, agent) => {
                  acc[agent.segment] = (acc[agent.segment] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>)
              ).map(([segment, count]) => (
                <div key={segment} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor:
                        SEGMENT_COLORS[segment as keyof typeof SEGMENT_COLORS] ||
                        "#8E8E93",
                    }}
                  />
                  <span className="text-xs text-text flex-1">
                    {SEGMENT_LABELS[segment as keyof typeof SEGMENT_LABELS] ||
                      segment}
                  </span>
                  <span className="text-xs text-text-muted">{count}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-border text-xs text-text-muted">
              {agents.length} total agents
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto pb-6">
          {/* Sort Options */}
          <div className="bg-surface rounded-[12px] border border-border p-2 flex gap-1">
            {[
              { key: "hot", icon: Flame, label: "Hot" },
              { key: "new", icon: Clock, label: "New" },
              { key: "top", icon: TrendingUp, label: "Top" },
            ].map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setSortBy(key as typeof sortBy)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-sm font-medium transition-colors ${
                  sortBy === key
                    ? "bg-sage-light text-sage-dark"
                    : "text-text-secondary hover:bg-background"
                }`}
              >
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>

          {/* Posts */}
          {posts.length === 0 ? (
            <div className="bg-surface rounded-[12px] border border-border p-8 text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 text-text-muted" />
              <p className="text-text-secondary">No posts yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="bg-surface rounded-[12px] border border-border"
                >
                  <div className="flex">
                    {/* Vote Column */}
                    <div className="w-12 bg-background rounded-l-[12px] flex flex-col items-center py-3 gap-1">
                      <button
                        onClick={() => handleVote(post.id, "up")}
                        className="text-text-muted hover:text-sage transition-colors"
                      >
                        <ArrowUp className="w-5 h-5" />
                      </button>
                      <span
                        className={`text-sm font-semibold ${
                          post.upvotes - post.downvotes > 0
                            ? "text-sage"
                            : post.upvotes - post.downvotes < 0
                            ? "text-curious"
                            : "text-text-muted"
                        }`}
                      >
                        {post.upvotes - post.downvotes}
                      </span>
                      <button
                        onClick={() => handleVote(post.id, "down")}
                        className="text-text-muted hover:text-curious transition-colors"
                      >
                        <ArrowDown className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Post Content */}
                    <div className="flex-1 p-4">
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        <span className="font-medium text-sage">
                          {post.subreddit}
                        </span>
                        <span>·</span>
                        <span>Posted by {post.authorName}</span>
                        <span>·</span>
                        <span>{post.timestamp}</span>
                        {post.flair && (
                          <span className="ml-2 px-2 py-0.5 bg-sage text-white rounded text-[10px] font-medium">
                            {post.flair}
                          </span>
                        )}
                      </div>

                      <h2 className="text-lg font-medium mt-2 text-text">
                        {post.title}
                      </h2>

                      <p className="text-sm text-text-secondary mt-2 whitespace-pre-wrap">
                        {post.content}
                      </p>

                      <div className="flex items-center gap-3 mt-4">
                        <button
                          onClick={() =>
                            setExpandedPost(
                              expandedPost === post.id ? null : post.id
                            )
                          }
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] hover:bg-background text-text-secondary text-xs font-medium"
                        >
                          <MessageSquare className="w-4 h-4" />
                          {post.comments.length} Comments
                        </button>
                        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] hover:bg-background text-text-secondary text-xs font-medium">
                          <Share className="w-4 h-4" />
                          Share
                        </button>
                      </div>

                      {/* Comments */}
                      {expandedPost === post.id && (
                        <div className="mt-4 border-t border-border pt-4">
                          {post.comments.length === 0 ? (
                            <p className="text-sm text-text-muted">
                              {isSimulating
                                ? "Waiting for agent responses..."
                                : "No comments yet..."}
                            </p>
                          ) : (
                            <div className="space-y-4">
                              {post.comments.map((comment, idx) => (
                                <CommentComponent
                                  key={`${comment.id}-${idx}`}
                                  comment={comment}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Sidebar - Stats */}
        <div className="w-[280px] shrink-0 overflow-y-auto pb-6">
          <div className="bg-surface rounded-[12px] border border-border overflow-hidden">
            <div className="bg-sage p-4">
              <h3 className="text-sm font-semibold text-white">
                Simulation Stats
              </h3>
            </div>
            <div className="p-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-text-muted">Active Agents</span>
                <span className="font-medium text-text">{agents.length}</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-text-muted">Total Comments</span>
                <span className="font-medium text-text">
                  {stats.totalComments}
                </span>
              </div>
              <div className="border-t border-border mt-3 pt-3">
                <div className="text-xs text-text-muted mb-2">Sentiment</div>
                <div className="flex gap-2">
                  <div className="flex-1 bg-sage/10 rounded-[8px] p-2 text-center">
                    <div className="text-lg font-bold text-sage">
                      {stats.totalComments > 0
                        ? Math.round(
                            (stats.positiveCount / stats.totalComments) * 100
                          )
                        : 0}
                      %
                    </div>
                    <div className="text-[10px] text-text-muted">Positive</div>
                  </div>
                  <div className="flex-1 bg-curious/10 rounded-[8px] p-2 text-center">
                    <div className="text-lg font-bold text-curious">
                      {stats.totalComments > 0
                        ? Math.round(
                            (stats.negativeCount / stats.totalComments) * 100
                          )
                        : 0}
                      %
                    </div>
                    <div className="text-[10px] text-text-muted">Negative</div>
                  </div>
                </div>
              </div>

              {/* Adoption Score */}
              {stats.totalComments > 0 && (
                <div className="border-t border-border mt-3 pt-3">
                  <div className="text-xs text-text-muted mb-2">
                    Adoption Score
                  </div>
                  <div className="relative h-3 bg-background rounded-full overflow-hidden">
                    <div
                      className={`absolute left-0 top-0 h-full transition-all duration-500 rounded-full ${
                        calculateAdoptionScore() > 65
                          ? "bg-sage"
                          : calculateAdoptionScore() > 40
                          ? "bg-amber-500"
                          : "bg-curious"
                      }`}
                      style={{ width: `${calculateAdoptionScore()}%` }}
                    />
                  </div>
                  <div className="text-center mt-2 text-xl font-bold text-text">
                    {calculateAdoptionScore()}%
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentComponent({
  comment,
  depth = 0,
}: {
  comment: LocalComment;
  depth?: number;
}) {
  const [votes, setVotes] = useState(comment.upvotes - comment.downvotes);

  const sentimentColor =
    comment.sentiment === "positive"
      ? "#7C9070"
      : comment.sentiment === "negative"
      ? "#D4845E"
      : "#8E8E93";

  const segmentColor =
    SEGMENT_COLORS[comment.segment as keyof typeof SEGMENT_COLORS] || "#8E8E93";

  return (
    <div
      className={`flex gap-3 ${
        depth > 0 ? "ml-6 border-l-2 border-border pl-4" : ""
      }`}
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
        style={{ backgroundColor: segmentColor }}
      >
        {comment.avatar}
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-text">{comment.authorName}</span>
          <span
            className="px-1.5 py-0.5 rounded text-[10px] text-white"
            style={{ backgroundColor: segmentColor }}
          >
            {SEGMENT_LABELS[comment.segment as keyof typeof SEGMENT_LABELS] ||
              comment.segment}
          </span>
          <span className="text-text-muted">· {comment.timestamp}</span>
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: sentimentColor }}
            title={`Sentiment: ${comment.sentiment}`}
          />
        </div>

        <p className="text-sm text-text mt-1">{comment.content}</p>

        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setVotes((v) => v + 1)}
              className="text-text-muted hover:text-sage transition-colors"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
            <span
              className={`text-xs font-semibold ${
                votes > 0
                  ? "text-sage"
                  : votes < 0
                  ? "text-curious"
                  : "text-text-muted"
              }`}
            >
              {votes}
            </span>
            <button
              onClick={() => setVotes((v) => v - 1)}
              className="text-text-muted hover:text-curious transition-colors"
            >
              <ArrowDown className="w-4 h-4" />
            </button>
          </div>
          <button className="text-xs text-text-muted font-medium hover:text-sage">
            Reply
          </button>
        </div>

        {comment.replies.length > 0 && (
          <div className="mt-3 space-y-3">
            {comment.replies.map((reply, idx) => (
              <CommentComponent key={`${reply.id}-${idx}`} comment={reply} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
