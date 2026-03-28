// User Segments
export type SegmentType = "power_user" | "casual" | "new_user" | "churned";

export interface Segment {
  type: SegmentType;
  count: number;
  color: string;
  label: string;
}

// Synthetic User / Agent
export interface Agent {
  id: string;
  name: string;
  avatar: string;
  segment: SegmentType;
  sessions: number;
  daysActive: number;
  topFeatures: string[];
  events: string[];
  churned: boolean;
  // Personality traits
  patience: "low" | "medium" | "high";
  techLevel: "novice" | "intermediate" | "expert";
  priceSensitivity: "low" | "medium" | "high";
  // Memory of what this agent has said
  memory: string[];
}

// Thread / Comments
export type ActionType = "comment" | "reply" | "upvote" | "downvote" | "silent";

export interface AgentDecision {
  action: ActionType;
  targetCommentId?: string; // For reply/vote
  sentiment?: "positive" | "neutral" | "negative";
}

export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorSegment: SegmentType;
  content: string;
  timestamp: Date;
  parentId?: string; // For replies
  upvotes: number;
  downvotes: number;
  sentiment: "positive" | "neutral" | "negative";
  isStreaming?: boolean;
}

export interface Thread {
  id: string;
  featureSpec: string;
  comments: Comment[];
  adoptionScore: number;
  round: number;
}

// AutoResearch Loop
export interface LoopIteration {
  round: number;
  featureSpec: string;
  topObjection: string;
  adoptionScore: number;
  comments: Comment[];
}

export interface LoopState {
  isRunning: boolean;
  currentRound: number;
  targetMetric: string;
  iterations: LoopIteration[];
}

// Feature Spec Diff
export interface SpecDiff {
  original: string;
  revised: string;
  changes: {
    removed: string[];
    added: string[];
  };
}

// API Response types
export interface StreamChunk {
  type: "decision" | "content" | "done";
  agentId: string;
  data: string;
}

export interface AgentResponse {
  decision: AgentDecision;
  content?: string;
}
