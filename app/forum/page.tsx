"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  ArrowDown,
  MessageSquare,
  Share,
  TrendingUp,
  Clock,
  Flame,
  Plus,
  Loader2,
  Users,
  Send,
  Zap,
} from "lucide-react";
import TopNav from "@/components/TopNav";
import {
  ForumAgent,
  Topic,
  AgentResponse,
  createTopic,
  createPost,
  simulateResponses,
  listTopics,
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

export default function ForumPage() {
  const router = useRouter();

  const [agents, setAgents] = useState<ForumAgent[]>([]);
  const [graphId, setGraphId] = useState<string | null>(null);

  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [posts, setPosts] = useState<LocalPost[]>([]);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [sortBy, setSortBy] = useState<"hot" | "new" | "top">("hot");

  const [showNewTopic, setShowNewTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [showNewPost, setShowNewPost] = useState(false);
  const [newPostTitle, setNewPostTitle] = useState("");
  const [newPostContent, setNewPostContent] = useState("");
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [creatingPost, setCreatingPost] = useState(false);

  const [stats, setStats] = useState({
    totalComments: 0,
    positiveCount: 0,
    negativeCount: 0,
    neutralCount: 0,
  });

  const broadcastChannel = useRef<BroadcastChannel | null>(null);
  const cleanupSSE = useRef<(() => void) | null>(null);

  useEffect(() => {
    const storedAgents = sessionStorage.getItem("crucible_agents");
    const storedGraphId = sessionStorage.getItem("crucible_graph_id");

    if (storedAgents) {
      try {
        setAgents(JSON.parse(storedAgents));
      } catch (e) {
        console.error("Failed to parse agents:", e);
      }
    }

    if (storedGraphId) {
      setGraphId(storedGraphId);
      loadTopics(storedGraphId);
    }

    broadcastChannel.current = new BroadcastChannel("crucible_sync");

    return () => {
      broadcastChannel.current?.close();
      cleanupSSE.current?.();
    };
  }, []);

  const loadTopics = async (gId: string) => {
    const result = await listTopics(gId);
    if (result.success) {
      setTopics(result.topics);
    }
  };

  const handleCreateTopic = async () => {
    if (!newTopicName.trim() || !graphId) return;

    setCreatingTopic(true);
    const result = await createTopic(newTopicName, graphId);

    if (result.success && result.topic) {
      setTopics((prev) => [result.topic!, ...prev]);
      setSelectedTopic(result.topic);
      setNewTopicName("");
      setShowNewTopic(false);
    }

    setCreatingTopic(false);
  };

  const handleCreatePost = async () => {
    if (!newPostContent.trim() || !selectedTopic) return;

    setCreatingPost(true);
    const result = await createPost(
      selectedTopic.id,
      newPostContent,
      newPostTitle || "New Feature Proposal"
    );

    if (result.success && result.post) {
      const localPost: LocalPost = {
        id: result.post.id,
        topic_id: result.post.topic_id,
        subreddit: selectedTopic.subreddit.replace("r/", ""),
        authorId: "pm",
        authorName: "Product Team",
        avatar: "PT",
        title: result.post.title,
        content: result.post.content,
        upvotes: result.post.upvotes,
        downvotes: result.post.downvotes,
        commentCount: 0,
        timestamp: "just now",
        comments: [],
        flair: "Announcement",
      };

      setPosts((prev) => [localPost, ...prev]);
      setExpandedPost(localPost.id);
      setNewPostTitle("");
      setNewPostContent("");
      setShowNewPost(false);

      startSimulation(selectedTopic.id, result.post.id);
    }

    setCreatingPost(false);
  };

  const startSimulation = (topicId: string, postId: string) => {
    setIsSimulating(true);
    cleanupSSE.current?.();

    cleanupSSE.current = simulateResponses(
      topicId,
      postId,
      Math.min(75, agents.length),
      (response: AgentResponse) => {
        if (response.action === "comment" && response.content) {
          const newComment: LocalComment = {
            id: `comment-${Date.now()}-${Math.random()}`,
            authorId: response.agent_id,
            authorName: response.agent_name,
            avatar: response.agent_name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2),
            segment: response.agent_segment,
            content: response.content,
            upvotes: Math.floor(Math.random() * 20) + 1,
            downvotes: Math.floor(Math.random() * 5),
            sentiment: response.sentiment || "neutral",
            timestamp: "just now",
            replies: [],
          };

          setPosts((prev) =>
            prev.map((post) => {
              if (post.id === postId) {
                return {
                  ...post,
                  comments: [...post.comments, newComment],
                  commentCount: post.comments.length + 1,
                };
              }
              return post;
            })
          );

          setStats((prev) => ({
            ...prev,
            totalComments: prev.totalComments + 1,
            positiveCount:
              prev.positiveCount + (response.sentiment === "positive" ? 1 : 0),
            negativeCount:
              prev.negativeCount + (response.sentiment === "negative" ? 1 : 0),
            neutralCount:
              prev.neutralCount + (response.sentiment === "neutral" ? 1 : 0),
          }));

          broadcastChannel.current?.postMessage({
            type: "AGENT_ACTION",
            agentId: response.agent_id,
            entityId: response.entity_id,
            action: "comment",
            sentiment: response.sentiment,
          });
        } else if (response.action === "upvote") {
          setPosts((prev) =>
            prev.map((post) =>
              post.id === postId ? { ...post, upvotes: post.upvotes + 1 } : post
            )
          );
        } else if (response.action === "downvote") {
          setPosts((prev) =>
            prev.map((post) =>
              post.id === postId
                ? { ...post, downvotes: post.downvotes + 1 }
                : post
            )
          );
        }
      },
      () => setIsSimulating(false),
      () => setIsSimulating(false)
    );
  };

  const calculateAdoptionScore = () => {
    const total = stats.positiveCount + stats.negativeCount + stats.neutralCount;
    if (total === 0) return 50;
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

  const filteredPosts = selectedTopic
    ? posts.filter((p) => p.topic_id === selectedTopic.id)
    : posts;

  if (agents.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <TopNav />
        <div className="flex items-center justify-center h-[calc(100vh-60px)]">
          <div className="text-center">
            <Users className="w-16 h-16 mx-auto mb-4 text-text-muted" />
            <h2 className="text-xl font-semibold text-text mb-2">
              No Agents Loaded
            </h2>
            <p className="text-text-secondary mb-4">
              Generate agents from the Graph page first.
            </p>
            <button
              onClick={() => router.push("/graph")}
              className="btn-primary"
            >
              <Zap className="w-4 h-4" />
              Go to Graph
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav />

      <div className="flex max-w-[1200px] mx-auto pt-6 px-6 gap-6">
        {/* Sidebar */}
        <div className="w-[260px] shrink-0 flex flex-col gap-4">
          {/* Topics */}
          <div className="bg-surface rounded-[12px] border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                Feature Topics
              </h3>
              <button
                onClick={() => setShowNewTopic(!showNewTopic)}
                className="text-sage hover:text-sage-dark transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {showNewTopic && (
              <div className="p-3 border-b border-border bg-background">
                <input
                  type="text"
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  placeholder="Feature name..."
                  className="w-full bg-surface text-sm text-text px-3 py-2 rounded-[8px] border border-border focus:border-sage focus:outline-none"
                />
                <button
                  onClick={handleCreateTopic}
                  disabled={creatingTopic || !newTopicName.trim()}
                  className="mt-2 w-full bg-sage text-white text-sm py-2 rounded-[8px] font-medium hover:bg-sage-dark disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {creatingTopic ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Create Topic"
                  )}
                </button>
              </div>
            )}

            <div className="py-2">
              <button
                onClick={() => setSelectedTopic(null)}
                className={`w-full px-4 py-2.5 text-left text-sm hover:bg-background transition-colors ${
                  !selectedTopic ? "bg-sage-light text-sage-dark font-medium" : "text-text"
                }`}
              >
                All Topics
              </button>
              {topics.map((topic) => (
                <button
                  key={topic.id}
                  onClick={() => setSelectedTopic(topic)}
                  className={`w-full px-4 py-2.5 text-left hover:bg-background transition-colors ${
                    selectedTopic?.id === topic.id
                      ? "bg-sage-light text-sage-dark font-medium"
                      : "text-text"
                  }`}
                >
                  <div className="text-sm">{topic.subreddit}</div>
                  <div className="text-xs text-text-muted">
                    {topic.member_count} agents
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Simulation Status */}
          {isSimulating && (
            <div className="bg-sage-light rounded-[12px] border border-sage/20 p-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-sage animate-pulse" />
                <span className="text-sm text-sage-dark font-medium">
                  Agents responding...
                </span>
              </div>
              <div className="mt-2 text-xs text-sage-dark/70">
                {stats.totalComments} comments so far
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
        <div className="flex-1 flex flex-col gap-4">
          {/* Topic Header */}
          {selectedTopic && (
            <div className="bg-surface rounded-[12px] border border-border p-5">
              <h1 className="text-xl font-semibold text-text">
                {selectedTopic.subreddit}
              </h1>
              <p className="text-sm text-text-secondary mt-1">
                {selectedTopic.description}
              </p>
              <div className="text-xs text-text-muted mt-2">
                {selectedTopic.member_count} agents participating
              </div>
            </div>
          )}

          {/* Create Post */}
          {selectedTopic && (
            <div className="bg-surface rounded-[12px] border border-border p-4">
              {showNewPost ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={newPostTitle}
                    onChange={(e) => setNewPostTitle(e.target.value)}
                    placeholder="Title (optional)"
                    className="w-full bg-background text-sm text-text px-4 py-2.5 rounded-[8px] border border-border focus:border-sage focus:outline-none"
                  />
                  <textarea
                    value={newPostContent}
                    onChange={(e) => setNewPostContent(e.target.value)}
                    placeholder="Describe your feature idea..."
                    rows={4}
                    className="w-full bg-background text-sm text-text px-4 py-3 rounded-[8px] border border-border focus:border-sage focus:outline-none resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowNewPost(false)}
                      className="text-sm text-text-secondary px-4 py-2 rounded-[8px] hover:bg-background"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreatePost}
                      disabled={creatingPost || !newPostContent.trim()}
                      className="btn-primary disabled:opacity-50"
                    >
                      {creatingPost ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Post & Simulate
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewPost(true)}
                  className="w-full text-left text-sm text-text-secondary bg-background px-4 py-3 rounded-[8px] border border-border hover:border-sage transition-colors"
                >
                  Post a new feature idea...
                </button>
              )}
            </div>
          )}

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
          {filteredPosts.length === 0 ? (
            <div className="bg-surface rounded-[12px] border border-border p-8 text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 text-text-muted" />
              <p className="text-text-secondary">
                {selectedTopic
                  ? "No posts yet. Create one to start the simulation!"
                  : "Select or create a topic to get started."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPosts.map((post) => (
                <div
                  key={post.id}
                  className="bg-surface rounded-[12px] border border-border hover:border-sage/50 transition-colors"
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
                              {post.comments.map((comment) => (
                                <CommentComponent
                                  key={comment.id}
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
        <div className="w-[280px] shrink-0">
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
                <span className="text-text-muted">Total Posts</span>
                <span className="font-medium text-text">{posts.length}</span>
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
            {comment.replies.map((reply) => (
              <CommentComponent key={reply.id} comment={reply} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
