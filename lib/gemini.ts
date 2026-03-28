import { GoogleGenerativeAI } from "@google/generative-ai";
import { AgentDecision, ActionType } from "@/types";

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Fast model for agent responses (low latency)
export const flashModel = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-exp",
});

// Pro model for AutoResearch rewriting (higher quality)
export const proModel = genAI.getGenerativeModel({
  model: "gemini-1.5-pro",
});

// Parse agent decision from LLM response
function parseAgentDecision(response: string): AgentDecision {
  const lower = response.toLowerCase();

  // Check for explicit actions
  if (lower.includes("reply to") || lower.includes("respond to")) {
    const match = response.match(/reply to (?:comment )?["']?([^"'\n]+)["']?/i);
    return {
      action: "reply",
      targetCommentId: match?.[1] || undefined,
      sentiment: extractSentiment(response),
    };
  }

  if (lower.includes("upvote")) {
    return { action: "upvote", sentiment: "positive" };
  }

  if (lower.includes("downvote")) {
    return { action: "downvote", sentiment: "negative" };
  }

  if (lower.includes("stay silent") || lower.includes("no action") || lower.includes("skip")) {
    return { action: "silent", sentiment: "neutral" };
  }

  // Default to comment
  return {
    action: "comment",
    sentiment: extractSentiment(response),
  };
}

function extractSentiment(text: string): "positive" | "neutral" | "negative" {
  const lower = text.toLowerCase();
  const negative = ["frustrated", "angry", "broken", "fix", "failed", "disappointed", "annoyed", "waste"];
  const positive = ["excited", "love", "great", "amazing", "finally", "helpful", "useful"];

  const negScore = negative.filter(w => lower.includes(w)).length;
  const posScore = positive.filter(w => lower.includes(w)).length;

  if (negScore > posScore) return "negative";
  if (posScore > negScore) return "positive";
  return "neutral";
}

// Get agent decision (what action to take)
export async function getAgentDecision(prompt: string): Promise<AgentDecision> {
  try {
    const result = await flashModel.generateContent(prompt);
    const text = result.response.text();
    return parseAgentDecision(text);
  } catch (error) {
    console.error("Error getting agent decision:", error);
    return { action: "silent", sentiment: "neutral" };
  }
}

// Get agent comment content (streaming)
export async function* streamAgentContent(prompt: string): AsyncGenerator<string> {
  try {
    const result = await flashModel.generateContentStream(prompt);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield text;
      }
    }
  } catch (error) {
    console.error("Error streaming agent content:", error);
    yield "I have no comment at this time.";
  }
}

// Non-streaming version for simpler use cases
export async function getAgentContent(prompt: string): Promise<string> {
  try {
    const result = await flashModel.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Error getting agent content:", error);
    return "I have no comment at this time.";
  }
}

// Rewrite feature spec based on objection (AutoResearch loop)
export async function rewriteFeatureSpec(
  originalSpec: string,
  topObjection: string,
  round: number
): Promise<string> {
  const prompt = `You are a product manager rewriting a feature specification based on user feedback.

ORIGINAL SPECIFICATION:
${originalSpec}

TOP USER OBJECTION (most upvoted negative feedback):
"${topObjection}"

TASK:
Rewrite the feature specification to address this objection while keeping the original feature intent.
This is round ${round} of iteration. Be pragmatic and specific.

Guidelines:
- Acknowledge the user's concern directly
- Adjust priorities if needed (e.g., fix bugs before adding features)
- Keep the response concise and actionable
- Use markdown formatting with headers and bullet points

Return ONLY the revised specification, no explanation.`;

  try {
    const result = await proModel.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Error rewriting feature spec:", error);
    return originalSpec;
  }
}

// Extract top objection from comments
export async function extractTopObjection(
  comments: Array<{ content: string; upvotes: number; sentiment: string }>
): Promise<string> {
  // Filter to negative comments and sort by upvotes
  const negativeComments = comments
    .filter(c => c.sentiment === "negative")
    .sort((a, b) => b.upvotes - a.upvotes);

  if (negativeComments.length === 0) {
    return "No significant objections found.";
  }

  // Return the most upvoted negative comment
  return negativeComments[0].content;
}

// Calculate adoption score from comments
export function calculateAdoptionScore(
  comments: Array<{ sentiment: string; upvotes: number }>
): number {
  if (comments.length === 0) return 50;

  let score = 50; // Start neutral

  for (const comment of comments) {
    const weight = 1 + (comment.upvotes * 0.5);
    if (comment.sentiment === "positive") {
      score += 5 * weight;
    } else if (comment.sentiment === "negative") {
      score -= 7 * weight; // Negative feedback weighs more
    }
  }

  // Clamp between 0 and 100
  return Math.max(0, Math.min(100, Math.round(score)));
}
