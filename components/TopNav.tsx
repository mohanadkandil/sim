"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap, TrendingUp, Share2, MessagesSquare, MessageCircle, PanelRightOpen, PanelRightClose } from "lucide-react";
import { useActivity } from "@/lib/activity-context";

const NAV_ITEMS = [
  { href: "/graph", label: "Graph", icon: Share2 },
  { href: "/forum", label: "Forum", icon: MessagesSquare },
  { href: "/dashboard", label: "Dashboard", icon: TrendingUp },
];

export default function TopNav() {
  const pathname = usePathname();
  const { showActivity, toggleActivity, activityCount } = useActivity();

  // Show activity toggle on graph and forum pages
  const showActivityToggle = pathname?.startsWith("/graph") || pathname?.startsWith("/forum");

  return (
    <div className="flex items-center px-8 py-4 w-full border-b border-border shrink-0 bg-surface">
      <Link href="/" className="flex items-center gap-2.5">
        <div className="w-7 h-7 bg-sage rounded-[8px] flex items-center justify-center">
          <Zap className="w-[15px] h-[15px] text-white" />
        </div>
        <span className="font-display text-lg font-medium text-text">
          Crucible
        </span>
      </Link>

      <div className="flex-1" />

      <div className="flex gap-1 items-center">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname?.startsWith(href + "/");
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

        {/* Activity Panel Toggle */}
        {showActivityToggle && (
          <>
            <div className="w-px h-6 bg-border mx-2" />
            <button
              onClick={toggleActivity}
              className={`relative flex items-center gap-1.5 rounded-[8px] px-3 py-2 text-[13px] font-medium transition-colors ${
                showActivity
                  ? "bg-sage-light text-sage-dark"
                  : "text-text-secondary hover:bg-background"
              }`}
              title={showActivity ? "Hide Activity" : "Show Activity"}
            >
              {showActivity ? (
                <PanelRightClose className="w-4 h-4" />
              ) : (
                <PanelRightOpen className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Activity</span>
              {activityCount > 0 && !showActivity && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-sage text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {activityCount > 99 ? "99+" : activityCount}
                </span>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
