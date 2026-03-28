import { Agent, Segment, SegmentType } from "@/types";

// Segment definitions with colors
export const segments: Record<SegmentType, Segment> = {
  power_user: {
    type: "power_user",
    count: 847,
    color: "#8B5CF6", // Electric violet
    label: "Power Users",
  },
  casual: {
    type: "casual",
    count: 623,
    color: "#06B6D4", // Cyan
    label: "Casual",
  },
  new_user: {
    type: "new_user",
    count: 489,
    color: "#FBBF24", // Amber
    label: "New Users",
  },
  churned: {
    type: "churned",
    count: 288,
    color: "#F97316", // Safety orange
    label: "Churned",
  },
};

// Demo agents - these tell the "export_failed" story
export const mockAgents: Agent[] = [
  {
    id: "agent_marcus",
    name: "Marcus Chen",
    avatar: "MC",
    segment: "power_user",
    sessions: 147,
    daysActive: 365,
    topFeatures: ["export", "bulk_edit", "analytics"],
    events: ["export_success", "export_success", "export_failed", "contacted_support"],
    churned: false,
    patience: "low",
    techLevel: "expert",
    priceSensitivity: "low",
    memory: [],
  },
  {
    id: "agent_sarah",
    name: "Sarah Kim",
    avatar: "SK",
    segment: "churned",
    sessions: 8,
    daysActive: 21,
    topFeatures: ["export", "import"],
    events: ["export_failed", "export_failed", "export_failed", "churned"],
    churned: true,
    patience: "low",
    techLevel: "intermediate",
    priceSensitivity: "high",
    memory: [],
  },
  {
    id: "agent_james",
    name: "James Wright",
    avatar: "JW",
    segment: "casual",
    sessions: 23,
    daysActive: 90,
    topFeatures: ["dashboard", "search"],
    events: ["feature_clicked", "upgrade_viewed", "feature_clicked"],
    churned: false,
    patience: "high",
    techLevel: "novice",
    priceSensitivity: "medium",
    memory: [],
  },
  {
    id: "agent_priya",
    name: "Priya Patel",
    avatar: "PP",
    segment: "power_user",
    sessions: 89,
    daysActive: 180,
    topFeatures: ["api", "export", "integrations"],
    events: ["api_call", "export_success", "api_call", "export_failed"],
    churned: false,
    patience: "medium",
    techLevel: "expert",
    priceSensitivity: "low",
    memory: [],
  },
  {
    id: "agent_alex",
    name: "Alex Rivera",
    avatar: "AR",
    segment: "new_user",
    sessions: 4,
    daysActive: 7,
    topFeatures: ["onboarding", "dashboard"],
    events: ["signup", "tutorial_completed", "feature_clicked"],
    churned: false,
    patience: "high",
    techLevel: "novice",
    priceSensitivity: "high",
    memory: [],
  },
  {
    id: "agent_emma",
    name: "Emma Thompson",
    avatar: "ET",
    segment: "churned",
    sessions: 12,
    daysActive: 45,
    topFeatures: ["export", "reports"],
    events: ["export_failed", "contacted_support", "export_failed", "churned"],
    churned: true,
    patience: "medium",
    techLevel: "intermediate",
    priceSensitivity: "medium",
    memory: [],
  },
  {
    id: "agent_david",
    name: "David Park",
    avatar: "DP",
    segment: "power_user",
    sessions: 234,
    daysActive: 400,
    topFeatures: ["analytics", "export", "team_management"],
    events: ["export_success", "team_invite", "analytics_viewed"],
    churned: false,
    patience: "medium",
    techLevel: "expert",
    priceSensitivity: "low",
    memory: [],
  },
  {
    id: "agent_lisa",
    name: "Lisa Chen",
    avatar: "LC",
    segment: "casual",
    sessions: 34,
    daysActive: 120,
    topFeatures: ["dashboard", "notifications"],
    events: ["feature_clicked", "notification_opened"],
    churned: false,
    patience: "high",
    techLevel: "intermediate",
    priceSensitivity: "medium",
    memory: [],
  },
  {
    id: "agent_mike",
    name: "Mike Johnson",
    avatar: "MJ",
    segment: "new_user",
    sessions: 2,
    daysActive: 3,
    topFeatures: ["onboarding"],
    events: ["signup", "trial_started"],
    churned: false,
    patience: "high",
    techLevel: "novice",
    priceSensitivity: "high",
    memory: [],
  },
  {
    id: "agent_nina",
    name: "Nina Rodriguez",
    avatar: "NR",
    segment: "power_user",
    sessions: 178,
    daysActive: 290,
    topFeatures: ["export", "bulk_edit", "api"],
    events: ["export_failed", "contacted_support", "export_success", "api_call"],
    churned: false,
    patience: "low",
    techLevel: "expert",
    priceSensitivity: "low",
    memory: [],
  },
  {
    id: "agent_tom",
    name: "Tom Williams",
    avatar: "TW",
    segment: "casual",
    sessions: 15,
    daysActive: 60,
    topFeatures: ["search", "dashboard"],
    events: ["feature_clicked", "search_performed"],
    churned: false,
    patience: "high",
    techLevel: "novice",
    priceSensitivity: "high",
    memory: [],
  },
  {
    id: "agent_amy",
    name: "Amy Zhang",
    avatar: "AZ",
    segment: "churned",
    sessions: 6,
    daysActive: 14,
    topFeatures: ["export"],
    events: ["export_failed", "export_failed", "churned"],
    churned: true,
    patience: "low",
    techLevel: "intermediate",
    priceSensitivity: "high",
    memory: [],
  },
];

// The demo feature spec that triggers the "export first" narrative
export const demoFeatureSpec = `**Feature: AI Autocomplete**

Add intelligent autocomplete suggestions powered by AI to help users write faster.

- Real-time suggestions as you type
- Context-aware completions based on your data
- Toggle on/off in settings
- Works across all text inputs`;

// Pre-computed demo results for the 3 rounds
export const demoRounds = {
  round1: {
    adoptionScore: 31,
    topObjection: "Our export has been broken for months. Why are you adding AI features instead of fixing core functionality?",
    featureSpec: demoFeatureSpec,
  },
  round2: {
    adoptionScore: 52,
    topObjection: "The export fix is good, but what about large file exports? Those still timeout.",
    featureSpec: `**Feature: AI Autocomplete + Export Reliability**

Before adding AI features, we're prioritizing export reliability:

1. **Export Fix (Priority)**
   - Fixed CSV/JSON export failures
   - Added progress indicator for large exports
   - Retry mechanism for failed exports

2. **AI Autocomplete (After export is stable)**
   - Real-time suggestions as you type
   - Context-aware completions
   - Toggle on/off in settings`,
  },
  round3: {
    adoptionScore: 74,
    topObjection: null,
    featureSpec: `**Feature: Reliable Export + AI Autocomplete**

Complete reliability-first approach:

1. **Export Overhaul (Shipping First)**
   - Fixed all CSV/JSON export failures
   - Large file exports now chunked (no timeouts)
   - Background processing with email notification
   - Export history with re-download option

2. **AI Autocomplete (Following Week)**
   - Real-time suggestions as you type
   - Context-aware completions based on your data
   - Toggle on/off in settings
   - Works across all text inputs`,
  },
};

// Helper to get random subset of agents for a simulation
export function getRandomAgents(count: number = 8): Agent[] {
  const shuffled = [...mockAgents].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Helper to calculate data lineage text for hover cards
export function getDataLineage(agent: Agent): string {
  const eventCount = agent.events.length;
  const topEvent = agent.events[0];
  return `Built from ${segments[agent.segment].count} real users · avg ${agent.sessions} sessions · ${topEvent.replace("_", " ")} ${eventCount}x`;
}
