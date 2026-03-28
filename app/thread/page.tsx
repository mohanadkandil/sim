"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Thread } from "@/components/Thread";
import { LoopPanel } from "@/components/LoopPanel";
import { Comment, LoopIteration, Agent, SegmentType } from "@/types";
import { mockAgents, demoFeatureSpec, demoRounds, getDataLineage } from "@/lib/mock-data";
import { buildDecisionPrompt, buildContentPrompt, shuffleAgents, generateCommentId, getTypingDelay } from "@/lib/agents";

export default function ThreadPage() {
  // Thread state - use user input or fallback to demo
  const [featureSpec, setFeatureSpec] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [adoptionScore, setAdoptionScore] = useState(50);
  const [isSimulating, setIsSimulating] = useState(false);

  // Loop state
  const [isLoopRunning, setIsLoopRunning] = useState(false);
  const [currentRound, setCurrentRound] = useState(1);
  const [targetMetric, setTargetMetric] = useState("Power user adoption > 70%");
  const [iterations, setIterations] = useState<LoopIteration[]>([]);
  const [topObjection, setTopObjection] = useState<string | null>(null);

  // Active segments for filtering
  const [activeSegments, setActiveSegments] = useState<SegmentType[]>([]);

  // Handle upvote
  const handleUpvote = useCallback((commentId: string) => {
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, upvotes: c.upvotes + 1 } : c))
    );
  }, []);

  // Handle downvote
  const handleDownvote = useCallback((commentId: string) => {
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, downvotes: c.downvotes + 1 } : c))
    );
  }, []);

  // Run simulation with mock data (for demo without API)
  const runDemoSimulation = useCallback(async () => {
    setIsSimulating(true);
    setComments([]);

    const agents = shuffleAgents(mockAgents).slice(0, 8);
    const demoComments: Comment[] = [];

    // Pre-defined demo comments that tell the "export_failed" story
    const demoContent = [
      { agent: agents[0], content: "I've been using this product for over a year. Before you add AI features, can you please fix the export? I've had 3 exports fail this month alone.", sentiment: "negative" as const },
      { agent: agents[1], content: "AI autocomplete sounds cool but honestly I stopped using this product because export never worked for me. Lost a whole week of work.", sentiment: "negative" as const },
      { agent: agents[2], content: "This could be useful! I type a lot of repetitive content so autocomplete would save time.", sentiment: "positive" as const },
      { agent: agents[3], content: "+1 on fixing export first. I've built workarounds using the API but most users can't do that.", sentiment: "negative" as const },
      { agent: agents[4], content: "I'm new here but AI autocomplete sounds like a nice feature to have.", sentiment: "positive" as const },
      { agent: agents[5], content: "I contacted support twice about export failures. Adding features while core functionality is broken feels wrong.", sentiment: "negative" as const },
      { agent: agents[6], content: "As a power user, I'd trade AI autocomplete for reliable export any day. Please prioritize stability.", sentiment: "negative" as const },
      { agent: agents[7], content: "The autocomplete could help with onboarding new team members. But yeah, export needs to work first.", sentiment: "neutral" as const },
    ];

    // Simulate streaming comments one by one
    for (let i = 0; i < demoContent.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, getTypingDelay()));

      const { agent, content, sentiment } = demoContent[i];
      const newComment: Comment = {
        id: generateCommentId(),
        authorId: agent.id,
        authorName: agent.name,
        authorAvatar: agent.avatar,
        authorSegment: agent.segment,
        content,
        timestamp: new Date(),
        upvotes: sentiment === "negative" ? Math.floor(Math.random() * 5) + 2 : Math.floor(Math.random() * 3),
        downvotes: sentiment === "positive" ? Math.floor(Math.random() * 2) : 0,
        sentiment,
      };

      demoComments.push(newComment);
      setComments([...demoComments]);

      // Update score based on sentiment
      const scoreChange = sentiment === "positive" ? 3 : sentiment === "negative" ? -5 : 0;
      setAdoptionScore((prev) => Math.max(0, Math.min(100, prev + scoreChange)));
    }

    // Final score for round 1
    setAdoptionScore(demoRounds.round1.adoptionScore);
    setTopObjection(demoRounds.round1.topObjection);
    setIsSimulating(false);
  }, []);

  // Run the AutoResearch loop
  const runCrucibleLoop = useCallback(async () => {
    setIsLoopRunning(true);

    // Round 2
    setCurrentRound(2);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setFeatureSpec(demoRounds.round2.featureSpec);
    setAdoptionScore(demoRounds.round2.adoptionScore);
    setTopObjection(demoRounds.round2.topObjection);
    setIterations((prev) => [
      ...prev,
      {
        round: 2,
        featureSpec: demoRounds.round2.featureSpec,
        topObjection: demoRounds.round1.topObjection,
        adoptionScore: demoRounds.round2.adoptionScore,
        comments: [],
      },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Round 3
    setCurrentRound(3);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setFeatureSpec(demoRounds.round3.featureSpec);
    setAdoptionScore(demoRounds.round3.adoptionScore);
    setTopObjection(null);
    setIterations((prev) => [
      ...prev,
      {
        round: 3,
        featureSpec: demoRounds.round3.featureSpec,
        topObjection: demoRounds.round2.topObjection!,
        adoptionScore: demoRounds.round3.adoptionScore,
        comments: [],
      },
    ]);

    setIsLoopRunning(false);
    setCurrentRound(3);
  }, []);

  // Load feature from sessionStorage and start simulation
  useEffect(() => {
    const storedFeature = sessionStorage.getItem("agentsim_feature");
    if (storedFeature) {
      setFeatureSpec(`**Feature Proposal**\n\n${storedFeature}`);
    } else {
      setFeatureSpec(demoFeatureSpec);
    }
    runDemoSimulation();
  }, [runDemoSimulation]);

  return (
    <div className="h-screen flex bg-background">
      {/* Left sidebar - 220px */}
      <div className="w-[220px] flex-shrink-0">
        <Sidebar
          activeSegments={activeSegments}
          onSelectSegment={(segment) => {
            setActiveSegments((prev) =>
              prev.includes(segment)
                ? prev.filter((s) => s !== segment)
                : [...prev, segment]
            );
          }}
          threadHistory={[
            { id: "1", title: "AI Autocomplete", score: adoptionScore },
          ]}
        />
      </div>

      {/* Main thread - flexible width */}
      <div className="flex-1 border-l border-r border-border overflow-hidden">
        <Thread
          featureSpec={featureSpec}
          comments={comments}
          adoptionScore={adoptionScore}
          isSimulating={isSimulating}
          onUpvote={handleUpvote}
          onDownvote={handleDownvote}
        />
      </div>

      {/* Right panel - 320px */}
      <div className="w-[320px] flex-shrink-0 bg-background-secondary">
        <LoopPanel
          adoptionScore={adoptionScore}
          topObjection={topObjection}
          iterations={iterations}
          isRunning={isLoopRunning}
          currentRound={currentRound}
          targetMetric={targetMetric}
          onRunLoop={runCrucibleLoop}
          onSetTarget={setTargetMetric}
        />
      </div>
    </div>
  );
}
