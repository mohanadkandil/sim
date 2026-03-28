"use client";

import { segments } from "@/lib/mock-data";
import { SegmentType } from "@/types";

interface SidebarProps {
  activeSegments?: SegmentType[];
  threadHistory?: { id: string; title: string; score: number }[];
  onSelectSegment?: (segment: SegmentType) => void;
  onSelectThread?: (id: string) => void;
}

export function Sidebar({
  activeSegments = [],
  threadHistory = [],
  onSelectSegment,
  onSelectThread,
}: SidebarProps) {
  return (
    <div className="h-full flex flex-col p-4 border-r border-border">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-8">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
          <FireIcon />
        </div>
        <span className="font-bold text-lg text-foreground">Crucible</span>
      </div>

      {/* Segments section */}
      <div className="mb-8">
        <h3 className="text-xs font-medium text-foreground-muted mb-3 uppercase tracking-wider">
          Population Segments
        </h3>
        <div className="space-y-2">
          {Object.values(segments).map((segment) => (
            <SegmentRow
              key={segment.type}
              segment={segment}
              isActive={activeSegments.includes(segment.type)}
              onClick={() => onSelectSegment?.(segment.type)}
            />
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground-muted">Total Population</span>
            <span className="font-medium text-foreground">
              {Object.values(segments).reduce((acc, s) => acc + s.count, 0).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Thread history */}
      <div className="flex-1 overflow-y-auto">
        <h3 className="text-xs font-medium text-foreground-muted mb-3 uppercase tracking-wider">
          History
        </h3>
        {threadHistory.length === 0 ? (
          <p className="text-xs text-foreground-muted">No previous threads</p>
        ) : (
          <div className="space-y-2">
            {threadHistory.map((thread) => (
              <ThreadHistoryItem
                key={thread.id}
                thread={thread}
                onClick={() => onSelectThread?.(thread.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* New thread button */}
      <button className="mt-4 w-full py-2 px-3 rounded-lg border border-border hover:border-accent hover:bg-accent/5 transition-all flex items-center justify-center gap-2 text-sm text-foreground-muted hover:text-accent">
        <PlusIcon />
        <span>New Thread</span>
      </button>
    </div>
  );
}

// Segment row component
function SegmentRow({
  segment,
  isActive,
  onClick,
}: {
  segment: typeof segments.power_user;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-2 rounded-lg transition-all ${
        isActive ? "bg-accent/10" : "hover:bg-background-secondary"
      }`}
    >
      <div
        className="w-3 h-3 rounded-full"
        style={{ backgroundColor: segment.color }}
      />
      <span className="text-sm text-foreground flex-1 text-left">{segment.label}</span>
      <span className="text-xs text-foreground-muted">{segment.count}</span>
    </button>
  );
}

// Thread history item
function ThreadHistoryItem({
  thread,
  onClick,
}: {
  thread: { id: string; title: string; score: number };
  onClick: () => void;
}) {
  const scoreColor =
    thread.score < 40 ? "text-red-400" : thread.score < 65 ? "text-amber-400" : "text-green-400";

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-2 rounded-lg hover:bg-background-secondary transition-colors"
    >
      <div className="text-sm text-foreground truncate">{thread.title}</div>
      <div className="flex items-center gap-2 mt-1">
        <span className={`text-xs font-medium ${scoreColor}`}>{thread.score}%</span>
        <span className="text-xs text-foreground-muted">adoption</span>
      </div>
    </button>
  );
}

// Icons
function FireIcon() {
  return (
    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 23c-4.97 0-9-3.582-9-8 0-2.845 1.682-5.39 3.146-7.317A21.31 21.31 0 0 1 9 4.96c.276-.283.692-.315 1.01-.077.318.237.39.66.168.992A22.252 22.252 0 0 0 8.5 9c0 .5.5 1 1 1s1-.5 1-1c0-2.3.9-4.3 2.5-6.4.276-.356.738-.426 1.092-.17.355.256.442.728.196 1.09C13.43 5.04 13 6.5 13 8c0 .5.5 1 1 1s1-.5 1-1c0-1.207.278-2.397.812-3.5.17-.354.563-.51.918-.36.356.15.52.53.38.89C16.5 6.5 16 8 16 10c0 1.1-.9 2-2 2s-2-.9-2-2c0-.333.03-.659.088-.975C10.71 10.343 10 12.084 10 14c0 2.21 1.79 4 4 4 3.314 0 6-2.686 6-6 0-2.77-1.88-5.1-4.43-5.8-.357-.098-.577-.446-.498-.803.079-.358.427-.583.79-.502C19.485 5.8 22 9.1 22 13c0 5.523-4.477 10-10 10z"/>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}
