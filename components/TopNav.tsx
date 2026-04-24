"use client";

import Link from "next/link";
import { Zap } from "lucide-react";

export default function TopNav() {
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
    </div>
  );
}
