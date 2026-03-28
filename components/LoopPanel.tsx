"use client";

import { ScoreBar } from "./ScoreBar";
import { LoopIteration } from "@/types";

interface LoopPanelProps {
  adoptionScore: number;
  topObjection: string | null;
  iterations: LoopIteration[];
  isRunning: boolean;
  currentRound: number;
  targetMetric: string;
  onRunLoop: () => void;
  onSetTarget: (target: string) => void;
}

export function LoopPanel({
  adoptionScore,
  topObjection,
  iterations,
  isRunning,
  currentRound,
  targetMetric,
  onRunLoop,
  onSetTarget,
}: LoopPanelProps) {
  return (
    <div className="h-full flex flex-col p-6 space-y-6">
      {/* Score section */}
      <div className="p-4 rounded-lg bg-background-secondary border border-border">
        <ScoreBar score={adoptionScore} targetScore={65} />
      </div>

      {/* Top objection */}
      {topObjection && (
        <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/30">
          <div className="flex items-center gap-2 mb-2">
            <AlertIcon />
            <span className="text-sm font-medium text-orange-400">Top Objection</span>
          </div>
          <p className="text-sm text-foreground-muted leading-relaxed">
            "{topObjection}"
          </p>
        </div>
      )}

      {/* Iteration history */}
      {iterations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground-muted">Iteration History</h3>
          {iterations.map((iter, idx) => (
            <IterationCard key={idx} iteration={iter} isActive={idx === iterations.length - 1} />
          ))}
        </div>
      )}

      {/* Target metric input */}
      <div className="space-y-2">
        <label className="text-sm text-foreground-muted">Target Metric</label>
        <input
          type="text"
          value={targetMetric}
          onChange={(e) => onSetTarget(e.target.value)}
          placeholder="e.g., Power user adoption > 70%"
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
        />
      </div>

      {/* Run loop button */}
      <button
        onClick={onRunLoop}
        disabled={isRunning}
        className={`w-full py-3 rounded-lg font-medium text-sm transition-all ${
          isRunning
            ? "bg-accent/20 text-accent cursor-not-allowed"
            : "bg-accent hover:bg-accent-hover text-white"
        }`}
      >
        {isRunning ? (
          <span className="flex items-center justify-center gap-2">
            <LoadingSpinner />
            Running Round {currentRound}...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <LoopIcon />
            Run Simuul Loop
          </span>
        )}
      </button>

      {/* Info text */}
      <p className="text-xs text-foreground-muted text-center">
        Extracts top objection, rewrites spec, re-simulates until target is met
      </p>
    </div>
  );
}

// Iteration card showing a single round
function IterationCard({ iteration, isActive }: { iteration: LoopIteration; isActive: boolean }) {
  const scoreColor =
    iteration.adoptionScore < 40
      ? "text-red-400"
      : iteration.adoptionScore < 65
      ? "text-amber-400"
      : "text-green-400";

  return (
    <div
      className={`p-3 rounded-lg border ${
        isActive ? "border-accent bg-accent/5" : "border-border bg-background-secondary"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-foreground-muted">Round {iteration.round}</span>
        <span className={`text-sm font-bold ${scoreColor}`}>{iteration.adoptionScore}%</span>
      </div>
      {iteration.topObjection && (
        <p className="text-xs text-foreground-muted truncate">
          Fixed: "{iteration.topObjection.slice(0, 50)}..."
        </p>
      )}
    </div>
  );
}

// Icons
function AlertIcon() {
  return (
    <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function LoopIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
