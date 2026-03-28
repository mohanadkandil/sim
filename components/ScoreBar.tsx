"use client";

import { useEffect, useState } from "react";

interface ScoreBarProps {
  score: number;
  targetScore?: number;
  showAnimation?: boolean;
}

export function ScoreBar({ score, targetScore = 65, showAnimation = true }: ScoreBarProps) {
  const [displayScore, setDisplayScore] = useState(showAnimation ? 0 : score);

  useEffect(() => {
    if (!showAnimation) {
      setDisplayScore(score);
      return;
    }

    // Animate score change
    const start = displayScore;
    const diff = score - start;
    const duration = 1000;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(start + diff * eased));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [score, showAnimation]);

  const getBarColor = (s: number) => {
    if (s < 40) return "bg-red-500";
    if (s < 65) return "bg-amber-500";
    return "bg-green-500";
  };

  const getTextColor = (s: number) => {
    if (s < 40) return "text-red-400";
    if (s < 65) return "text-amber-400";
    return "text-green-400";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground-muted">Adoption Score</span>
        <span className={`text-2xl font-bold ${getTextColor(displayScore)}`}>
          {displayScore}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-3 rounded-full bg-background overflow-hidden">
        {/* Target marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white/50 z-10"
          style={{ left: `${targetScore}%` }}
        />

        {/* Score bar */}
        <div
          className={`h-full rounded-full transition-all duration-500 ${getBarColor(displayScore)}`}
          style={{ width: `${displayScore}%` }}
        />
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-xs text-foreground-muted">
        <span>0%</span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-white/50" />
          Target: {targetScore}%
        </span>
        <span>100%</span>
      </div>
    </div>
  );
}
