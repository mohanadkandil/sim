"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Lightbulb, Users, Play } from "lucide-react";

const SUGGESTIONS = [
  "Add AI copilot",
  "Remove free tier",
  "Redesign onboarding",
  "Launch mobile app",
];

export default function InputPage() {
  const router = useRouter();
  const [featureText, setFeatureText] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const handleRun = async () => {
    if (!featureText.trim()) return;

    setIsRunning(true);
    // Store the feature in sessionStorage for the output page
    sessionStorage.setItem("agentsim_feature", featureText);

    // Navigate to the thread simulation page
    router.push("/thread");
  };

  const handleSuggestion = (suggestion: string) => {
    setFeatureText(suggestion);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      <div className="w-full max-w-[680px] flex flex-col items-center gap-10">
        {/* Top Section */}
        <div className="flex flex-col items-center gap-4 w-full">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-sage rounded-[10px] flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="font-display text-[22px] font-medium text-text">
              Crucible
            </span>
          </div>

          {/* Headline */}
          <h1 className="font-display text-[44px] font-medium text-text text-center leading-[1.15] tracking-[-1px]">
            What feature will you ship next?
          </h1>
        </div>

        {/* Input Card */}
        <div className="w-full bg-surface rounded-[16px] p-6 border border-border shadow-[0_4px_30px_#00000006] flex flex-col gap-4">
          <textarea
            value={featureText}
            onChange={(e) => setFeatureText(e.target.value)}
            className="w-full bg-background rounded-[12px] border border-border p-4 px-5 text-[15px] text-text-secondary leading-relaxed resize-none outline-none min-h-[80px] placeholder:text-text-secondary"
            rows={3}
            placeholder="We will add dark mode support with custom themes and a palette editor so users can personalize their workspace..."
          />

          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* Hints */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="pill pill-sage">
                <Lightbulb className="w-3 h-3 text-sage" />
                Be specific
              </span>
              <span className="pill pill-curious">
                <Users className="w-3 h-3 text-curious" />
                30 agents ready
              </span>
            </div>

            {/* Run Button */}
            <button
              onClick={handleRun}
              disabled={isRunning || !featureText.trim()}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4" />
              <span>{isRunning ? "Starting..." : "Run Simulation"}</span>
            </button>
          </div>
        </div>

        {/* Suggestions */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className="text-xs font-medium text-text-muted">Try:</span>
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => handleSuggestion(suggestion)}
              className="inline-flex items-center rounded-[8px] px-3 py-1.5 border border-border bg-transparent text-xs text-text-secondary cursor-pointer whitespace-nowrap hover:bg-background transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
