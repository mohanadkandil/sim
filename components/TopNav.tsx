"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Zap, Share2 } from "lucide-react";

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const isGraphActive = pathname?.startsWith("/graph");
  const [activeGraphId, setActiveGraphId] = useState<string | null>(null);

  useEffect(() => {
    setActiveGraphId(sessionStorage.getItem("crucible_graph_id"));
  }, [pathname]);

  const handleGraphClick = () => {
    const id = sessionStorage.getItem("crucible_graph_id");
    router.push(id ? `/graph/${id}` : "/graph");
  };

  return (
    <div className="flex items-center px-8 py-4 w-full border-b border-border shrink-0 bg-surface">
      <Link href="/" className="flex items-center gap-2.5">
        <div className="w-7 h-7 bg-sage rounded-[8px] flex items-center justify-center">
          <Zap className="w-[15px] h-[15px] text-white" />
        </div>
        <span className="font-display text-lg font-medium text-text">
          Simuul
        </span>
      </Link>

      <div className="flex-1" />

      <button
        onClick={handleGraphClick}
        className={`flex items-center gap-1.5 rounded-[8px] px-3.5 py-2 text-[13px] font-medium transition-colors ${
          isGraphActive
            ? "bg-sage-light font-semibold text-sage-dark"
            : "text-text-secondary hover:bg-background"
        }`}
      >
        <Share2 className={`w-3.5 h-3.5 ${isGraphActive ? "text-sage" : "text-text-muted"}`} />
        Graph
      </button>
    </div>
  );
}
