"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap, TrendingUp, Share2, MessageSquare } from "lucide-react";

const NAV_ITEMS = [
  { href: "/graph", label: "Graph", icon: Share2 },
  { href: "/thread", label: "Thread", icon: MessageSquare },
  { href: "/dashboard", label: "Dashboard", icon: TrendingUp },
];

export default function TopNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center px-8 py-4 w-full border-b border-border shrink-0">
      <Link href="/" className="flex items-center gap-2.5">
        <div className="w-7 h-7 bg-sage rounded-[8px] flex items-center justify-center">
          <Zap className="w-[15px] h-[15px] text-white" />
        </div>
        <span className="font-display text-lg font-medium text-text">
          Crucible
        </span>
      </Link>

      <div className="flex-1" />

      <div className="flex gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 rounded-[8px] px-3.5 py-2 text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-sage-light font-semibold text-sage-dark"
                  : "text-text-secondary hover:bg-background"
              }`}
            >
              <Icon
                className={`w-3.5 h-3.5 ${
                  isActive ? "text-sage" : "text-text-muted"
                }`}
              />
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
