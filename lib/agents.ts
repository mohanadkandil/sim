import { Agent, Comment, SegmentType } from "@/types";
import { segments } from "./mock-data";

// Build the decision prompt - asks agent what action to take
export function buildDecisionPrompt(
  agent: Agent,
  featureSpec: string,
  threadSoFar: Comment[]
): string {
  const threadText = threadSoFar.length > 0
    ? threadSoFar.map(c => {
        const replyIndicator = c.parentId ? "  [reply]" : "";
        return `${c.authorName} (${c.authorSegment}):${replyIndicator} ${c.content} [${c.upvotes} upvotes]`;
      }).join("\n")
    : "(No comments yet - you would be the first to respond)";

  return `You are ${agent.name}, a ${formatSegment(agent.segment)} of this product.

YOUR BEHAVIORAL DATA (built from real usage):
- Sessions: ${agent.sessions} over ${agent.daysActive} days
- Most-used features: ${agent.topFeatures.join(", ")}
- Recent events: ${agent.events.join(" → ")}
- Account status: ${agent.churned ? "CHURNED (left the product)" : "Active"}

YOUR PERSONALITY:
- Patience level: ${agent.patience}
- Technical sophistication: ${agent.techLevel}
- Price sensitivity: ${agent.priceSensitivity}

${agent.memory.length > 0 ? `THINGS YOU'VE SAID BEFORE:\n${agent.memory.join("\n")}` : ""}

---

THE PM POSTED THIS FEATURE IDEA:
${featureSpec}

CURRENT THREAD:
${threadText}

---

DECIDE WHAT TO DO. Choose ONE:
1. POST A COMMENT - Share your genuine reaction based on your experience
2. REPLY TO [name] - Respond to a specific person's comment
3. UPVOTE - Silently agree with a comment (specify which)
4. DOWNVOTE - Silently disagree with a comment (specify which)
5. STAY SILENT - Don't engage (maybe you don't care about this feature)

Your response should start with your decision (e.g., "POST A COMMENT" or "REPLY TO Marcus" or "STAY SILENT"), then briefly explain why based on YOUR specific experience with the product.`;
}

// Build the content prompt - generates the actual comment text
export function buildContentPrompt(
  agent: Agent,
  featureSpec: string,
  threadSoFar: Comment[],
  replyingTo?: Comment
): string {
  const context = replyingTo
    ? `You are replying to ${replyingTo.authorName} who said: "${replyingTo.content}"`
    : "You are posting a new top-level comment";

  return `You are ${agent.name}, a ${formatSegment(agent.segment)} of this product.

YOUR BACKGROUND:
- ${agent.sessions} sessions over ${agent.daysActive} days
- Top features: ${agent.topFeatures.join(", ")}
- Key events: ${agent.events.join(" → ")}
- Status: ${agent.churned ? "Churned" : "Active user"}
- Patience: ${agent.patience}, Tech level: ${agent.techLevel}

THE FEATURE BEING DISCUSSED:
${featureSpec}

${context}

Write a SHORT comment (1-3 sentences) that reflects YOUR specific experience.
- Be specific about YOUR usage patterns
- Reference actual events from your history if relevant
- Don't be generic - this should sound like a real user with your exact background
- If you've had problems (like export_failed), mention them naturally
- Match your patience level in tone

Return ONLY your comment text, no quotation marks or attribution.`;
}

// Helper to format segment type for display
function formatSegment(segment: SegmentType): string {
  const labels: Record<SegmentType, string> = {
    power_user: "power user",
    casual: "casual user",
    new_user: "new user",
    churned: "former user (churned)",
  };
  return labels[segment];
}

// Generate avatar initials from name
export function getAvatarInitials(name: string): string {
  return name
    .split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Get segment color
export function getSegmentColor(segment: SegmentType): string {
  return segments[segment].color;
}

// Get sentiment-based styling
export function getSentimentStyle(sentiment: "positive" | "neutral" | "negative"): {
  borderColor: string;
  bgColor: string;
} {
  switch (sentiment) {
    case "positive":
      return { borderColor: "border-green-500/30", bgColor: "bg-green-500/5" };
    case "negative":
      return { borderColor: "border-orange-500/30", bgColor: "bg-orange-500/5" };
    default:
      return { borderColor: "border-border", bgColor: "bg-transparent" };
  }
}

// Simulate typing delay (1.5-3 seconds as per spec)
export function getTypingDelay(): number {
  return 1500 + Math.random() * 1500; // 1.5-3 seconds
}

// Shuffle agents for random order
export function shuffleAgents(agents: Agent[]): Agent[] {
  const shuffled = [...agents];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Create a unique comment ID
export function generateCommentId(): string {
  return `cmt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Update agent memory after they speak
export function updateAgentMemory(agent: Agent, content: string): Agent {
  return {
    ...agent,
    memory: [...agent.memory.slice(-2), content], // Keep last 3 things said
  };
}
