'use client';

import { useRouter } from 'next/navigation';


const avatars = [
  // Top row
  { name: 'eddy-lin',          size: 96,  x: 3,    y: 4,   color: '#8B5CF6' },
  { name: 'klaus-mueller',     size: 72,  x: 14,   y: 10,  color: '#7C9070' },
  { name: 'tom-moreno',        size: 64,  x: 26,   y: 5,   color: '#5B9BD5' },
  { name: 'mei-lin',           size: 80,  x: 38,   y: 7,   color: '#8B5CF6' },
  { name: 'hailey-johnson',    size: 68,  x: 52,   y: 3,   color: '#F59E0B' },
  { name: 'isabella-rodriguez',size: 76,  x: 63,   y: 8,   color: '#7C9070' },
  { name: 'adam-smith',        size: 70,  x: 75,   y: 4,   color: '#5B9BD5' },
  { name: 'rajiv-patel',       size: 100, x: 86,   y: 3,   color: '#8B5CF6' },

  // Right column
  { name: 'giorgio-rossi',     size: 80,  x: 91,   y: 24,  color: '#5B9BD5' },
  { name: 'john-lin',          size: 88,  x: 89,   y: 42,  color: '#7C9070' },
  { name: 'ayesha-khan',       size: 72,  x: 92,   y: 60,  color: '#8B5CF6' },
  { name: 'carmen-ortiz',      size: 92,  x: 88,   y: 76,  color: '#F59E0B' },

  // Bottom row
  { name: 'francisco-lopez',   size: 68,  x: 76,   y: 87,  color: '#7C9070' },
  { name: 'latoya-williams',   size: 80,  x: 63,   y: 85,  color: '#8B5CF6' },
  { name: 'sam-moore',         size: 64,  x: 50,   y: 89,  color: '#5B9BD5' },
  { name: 'jennifer-moore',    size: 76,  x: 37,   y: 86,  color: '#7C9070' },
  { name: 'tamara-taylor',     size: 64,  x: 25,   y: 88,  color: '#F59E0B' },
  { name: 'wolfgang-schulz',   size: 72,  x: 13,   y: 84,  color: '#8B5CF6' },

  // Left column
  { name: 'ryan-park',         size: 92,  x: 2,    y: 76,  color: '#5B9BD5' },
  { name: 'yuriko-yamamoto',   size: 76,  x: 3,    y: 59,  color: '#7C9070' },
  { name: 'arthur-burton',     size: 88,  x: 1.5,  y: 40,  color: '#8B5CF6' },
  { name: 'maria-lopez',       size: 68,  x: 3.5,  y: 23,  color: '#EC4899' },
];

export default function LandingPage() {
  const router = useRouter();

  return (
    <main className="relative w-full min-h-screen bg-white overflow-hidden">

      {/* Subtle background blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[600px] h-[600px] rounded-full -top-32 -left-32 opacity-[0.06]"
          style={{ background: 'radial-gradient(circle, #8B5CF6, transparent 70%)' }} />
        <div className="absolute w-[500px] h-[500px] rounded-full -bottom-24 -right-24 opacity-[0.07]"
          style={{ background: 'radial-gradient(circle, #7C9070, transparent 70%)' }} />
        <div className="absolute w-[400px] h-[400px] rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, #5B9BD5, transparent 70%)' }} />
      </div>

      {/* Avatar grid */}
      {avatars.map((avatar) => (
        <div
          key={avatar.name}
          className="absolute rounded-full overflow-hidden ring-2 ring-white"
          style={{
            width: avatar.size,
            height: avatar.size,
            left: `${avatar.x}%`,
            top: `${avatar.y}%`,
            boxShadow: `0 4px 20px rgba(0,0,0,0.10), 0 0 0 3px ${avatar.color}30`,
            outline: `2.5px solid ${avatar.color}60`,
            outlineOffset: '2px',
          }}
        >
          <img
            src={`/avatars/${avatar.name}.png`}
            alt={avatar.name}
            className="w-full h-full object-cover"
            draggable={false}
          />
        </div>
      ))}

      {/* Center content */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-5 z-20 text-center px-6">

        <span className="text-xs font-semibold text-[#7C9070] tracking-[3px] uppercase">
          Simuul
        </span>

        <h1 className="text-5xl md:text-7xl font-extrabold text-[#111111] leading-[1.05] tracking-tight">
          Simulate your users
        </h1>

        <h2 className="text-5xl md:text-7xl font-extrabold leading-[1.05] tracking-tight -mt-1"
          style={{ color: '#7C9070' }}>
          before you ship
        </h2>

        <p className="text-base md:text-lg text-[#6B6B6B] max-w-[520px] leading-relaxed mt-1">
          Test pricing changes, feature launches, and PR disasters with 200 AI
          users in 30 seconds. No surveys. No waiting. Just answers.
        </p>

        <button
          onClick={() => router.push('/start')}
          className="mt-2 px-10 py-4 rounded-full text-white text-base font-semibold transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #7C9070 0%, #5A7050 100%)',
            boxShadow: '0 4px 24px rgba(124, 144, 112, 0.35)',
          }}
        >
          Try Now →
        </button>

        <div className="flex items-center gap-3 sm:gap-6 mt-1 flex-wrap justify-center">
          <span className="text-xs sm:text-sm text-[#AAAAAA]">200 AI agents</span>
          <span className="text-[#DDDDDD]">•</span>
          <span className="text-xs sm:text-sm text-[#AAAAAA]">Real personalities</span>
          <span className="text-[#DDDDDD]">•</span>
          <span className="text-xs sm:text-sm text-[#AAAAAA]">Instant feedback</span>
        </div>
      </div>
    </main>
  );
}
