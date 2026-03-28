"use client";

import { Comment as CommentType } from "@/types";
import { Comment } from "./Comment";
import { getDataLineage } from "@/lib/mock-data";
import { mockAgents } from "@/lib/mock-data";

interface ThreadProps {
  featureSpec: string;
  comments: CommentType[];
  adoptionScore: number;
  isSimulating: boolean;
  onUpvote?: (id: string) => void;
  onDownvote?: (id: string) => void;
}

export function Thread({
  featureSpec,
  comments,
  adoptionScore,
  isSimulating,
  onUpvote,
  onDownvote,
}: ThreadProps) {
  // Organize comments into tree structure
  const topLevelComments = comments.filter(c => !c.parentId);
  const repliesMap = comments.reduce((acc, c) => {
    if (c.parentId) {
      if (!acc[c.parentId]) acc[c.parentId] = [];
      acc[c.parentId].push(c);
    }
    return acc;
  }, {} as Record<string, CommentType[]>);

  // Get data lineage for an agent
  const getLineage = (authorId: string) => {
    const agent = mockAgents.find(a => a.id === authorId);
    return agent ? getDataLineage(agent) : undefined;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Feature Spec Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
              <span className="text-accent font-bold">PM</span>
            </div>
            <div>
              <div className="font-medium text-foreground">Product Manager</div>
              <div className="text-xs text-foreground-muted">Posted a feature idea</div>
            </div>
          </div>
          <ScoreBadge score={adoptionScore} />
        </div>

        {/* Feature spec content */}
        <div className="p-4 rounded-lg bg-background-secondary border border-border">
          <div className="prose prose-invert prose-sm max-w-none">
            <div className="whitespace-pre-wrap text-sm text-foreground">
              {featureSpec}
            </div>
          </div>
        </div>

        {/* Simulation status */}
        {isSimulating && (
          <div className="mt-4 flex items-center gap-2 text-sm text-foreground-muted">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span>Agents are reading and responding...</span>
          </div>
        )}
      </div>

      {/* Comments Feed */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {comments.length === 0 && !isSimulating && (
          <div className="text-center py-12 text-foreground-muted">
            <p>No comments yet. Start the simulation to see how users react.</p>
          </div>
        )}

        {topLevelComments.map(comment => (
          <div key={comment.id} className="space-y-3">
            <Comment
              comment={comment}
              onUpvote={onUpvote}
              onDownvote={onDownvote}
              dataLineage={getLineage(comment.authorId)}
            />
            {/* Replies */}
            {repliesMap[comment.id]?.map(reply => (
              <Comment
                key={reply.id}
                comment={reply}
                isNested
                onUpvote={onUpvote}
                onDownvote={onDownvote}
                dataLineage={getLineage(reply.authorId)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Score badge component
function ScoreBadge({ score }: { score: number }) {
  const getScoreColor = (s: number) => {
    if (s < 40) return { bg: "bg-red-500/20", text: "text-red-400", label: "Low" };
    if (s < 65) return { bg: "bg-amber-500/20", text: "text-amber-400", label: "Medium" };
    return { bg: "bg-green-500/20", text: "text-green-400", label: "High" };
  };

  const { bg, text, label } = getScoreColor(score);

  return (
    <div className={`px-3 py-1.5 rounded-full ${bg} flex items-center gap-2`}>
      <span className={`text-sm font-bold ${text}`}>{score}%</span>
      <span className={`text-xs ${text}`}>Adoption</span>
    </div>
  );
}
