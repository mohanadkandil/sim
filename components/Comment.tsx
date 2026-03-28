"use client";

import { useState } from "react";
import { Comment as CommentType, SegmentType } from "@/types";
import { getSegmentColor, getSentimentStyle } from "@/lib/agents";
import { segments } from "@/lib/mock-data";

interface CommentProps {
  comment: CommentType;
  isNested?: boolean;
  onUpvote?: (id: string) => void;
  onDownvote?: (id: string) => void;
  dataLineage?: string;
}

export function Comment({
  comment,
  isNested = false,
  onUpvote,
  onDownvote,
  dataLineage,
}: CommentProps) {
  const [showHoverCard, setShowHoverCard] = useState(false);
  const segmentColor = getSegmentColor(comment.authorSegment);
  const { borderColor, bgColor } = getSentimentStyle(comment.sentiment);

  return (
    <div
      className={`relative ${isNested ? "ml-8 border-l-2 border-border pl-4" : ""}`}
    >
      <div
        className={`p-4 rounded-lg border ${borderColor} ${bgColor} transition-all duration-200 hover:border-border-light`}
      >
        {/* Author row */}
        <div className="flex items-center gap-3 mb-2">
          {/* Avatar with segment color ring */}
          <div
            className="relative"
            onMouseEnter={() => setShowHoverCard(true)}
            onMouseLeave={() => setShowHoverCard(false)}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold cursor-pointer"
              style={{
                backgroundColor: `${segmentColor}20`,
                border: `2px solid ${segmentColor}`,
                color: segmentColor,
              }}
            >
              {comment.authorAvatar}
            </div>

            {/* Hover card */}
            {showHoverCard && (
              <AgentHoverCard
                name={comment.authorName}
                segment={comment.authorSegment}
                dataLineage={dataLineage}
              />
            )}
          </div>

          {/* Name and segment */}
          <div className="flex items-center gap-2">
            <span
              className="font-medium text-sm cursor-pointer hover:underline"
              style={{ color: segmentColor }}
              onMouseEnter={() => setShowHoverCard(true)}
              onMouseLeave={() => setShowHoverCard(false)}
            >
              {comment.authorName}
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: `${segmentColor}15`,
                color: segmentColor,
              }}
            >
              {segments[comment.authorSegment].label}
            </span>
          </div>

          {/* Timestamp */}
          <span className="text-xs text-foreground-muted ml-auto">
            {formatTimestamp(comment.timestamp)}
          </span>
        </div>

        {/* Content */}
        <div className="text-sm text-foreground leading-relaxed">
          {comment.content}
          {comment.isStreaming && (
            <span className="inline-block w-2 h-4 bg-accent ml-1 animate-pulse" />
          )}
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-4 mt-3 text-xs text-foreground-muted">
          <button
            onClick={() => onUpvote?.(comment.id)}
            className="flex items-center gap-1 hover:text-healthy transition-colors"
          >
            <UpvoteIcon />
            <span>{comment.upvotes}</span>
          </button>
          <button
            onClick={() => onDownvote?.(comment.id)}
            className="flex items-center gap-1 hover:text-churned transition-colors"
          >
            <DownvoteIcon />
            <span>{comment.downvotes}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Agent hover card showing data lineage
function AgentHoverCard({
  name,
  segment,
  dataLineage,
}: {
  name: string;
  segment: SegmentType;
  dataLineage?: string;
}) {
  const segmentColor = getSegmentColor(segment);
  const segmentData = segments[segment];

  return (
    <div className="absolute left-0 top-full mt-2 z-50 w-72 p-4 rounded-lg bg-background-secondary border border-border shadow-xl">
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
          style={{
            backgroundColor: `${segmentColor}20`,
            border: `2px solid ${segmentColor}`,
            color: segmentColor,
          }}
        >
          {name.split(" ").map(n => n[0]).join("")}
        </div>
        <div>
          <div className="font-medium text-foreground">{name}</div>
          <div className="text-xs" style={{ color: segmentColor }}>
            {segmentData.label}
          </div>
        </div>
      </div>

      {/* Data lineage - the key insight */}
      <div className="text-xs text-foreground-muted leading-relaxed p-2 rounded bg-background border border-border">
        {dataLineage || `Built from ${segmentData.count} real users with similar behavior patterns`}
      </div>

      {/* Visual indicator */}
      <div className="mt-3 flex items-center gap-2">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: segmentColor }}
        />
        <span className="text-xs text-foreground-muted">
          Synthetic persona · Based on real data
        </span>
      </div>
    </div>
  );
}

// Utility icons
function UpvoteIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  );
}

function DownvoteIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
