"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Lightbulb, Users, Play, Loader2 } from "lucide-react";

const API_BASE = "http://localhost:5001/api/graph";

const SUGGESTIONS = [
  "Add AI-powered training plan recommendations based on recent activity",
  "Remove free tier and move everything behind Strava Summit",
  "Let users challenge friends to beat their segment times",
  "Show a weekly effort score on the home feed",
];

export default function InputPage() {
  const router = useRouter();
  const [featureText, setFeatureText] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("");

  const handleRun = async () => {
    if (!featureText.trim()) return;

    setIsRunning(true);
    setStatus("Starting simulation...");

    // Store the feature text for the graph page to use
    sessionStorage.setItem("crucible_feature_text", featureText);
    sessionStorage.setItem("crucible_stream_mode", "true");

    // Navigate immediately to graph page to see agents populate in real-time
    router.push("/graph");
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
              Simuul
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
            className="w-full bg-background rounded-[12px] border border-border p-4 px-5 text-[15px] text-text leading-relaxed resize-none outline-none min-h-[100px] placeholder:text-text-secondary focus:border-sage transition-colors"
            rows={4}
            placeholder="Describe your feature idea in detail. For example: We will add an AI-powered export feature that automatically formats data for different platforms..."
            disabled={isRunning}
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
                200 agents ready
              </span>
            </div>

            {/* Run Button */}
            <button
              onClick={handleRun}
              disabled={isRunning || !featureText.trim()}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{status || "Starting..."}</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Run Simulation</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Suggestions */}
        <div className="flex flex-col items-center gap-3 w-full">
          <span className="text-xs font-medium text-text-muted">Try an example:</span>
          <div className="flex flex-wrap gap-2 justify-center">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => handleSuggestion(suggestion)}
                disabled={isRunning}
                className="inline-flex items-center rounded-[8px] px-3 py-2 border border-border bg-transparent text-xs text-text-secondary cursor-pointer hover:bg-background hover:border-sage transition-colors disabled:opacity-50 max-w-[200px] text-left"
              >
                {suggestion.length > 40 ? suggestion.slice(0, 40) + "..." : suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
