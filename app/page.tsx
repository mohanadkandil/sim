'use client';

import { useRouter } from 'next/navigation';

const avatars = [
  { name: 'eddy-lin', size: 180, x: 2, y: 3, glow: '#8B5CF6', blur: 50, spread: 8, big: true },
  { name: 'klaus-mueller', size: 85, x: 14, y: 11, glow: '#7C9070', blur: 30, spread: 4 },
  { name: 'tom-moreno', size: 75, x: 26, y: 4, glow: '#5B9BD5', blur: 25, spread: 3 },
  { name: 'mei-lin', size: 90, x: 38, y: 8, glow: '#8B5CF6', blur: 30, spread: 4 },
  { name: 'hailey-johnson', size: 70, x: 52, y: 4, glow: '#F59E0B', blur: 25, spread: 3 },
  { name: 'isabella-rodriguez', size: 85, x: 64, y: 7, glow: '#7C9070', blur: 30, spread: 4 },
  { name: 'adam-smith', size: 80, x: 76, y: 5, glow: '#5B9BD5', blur: 28, spread: 3 },
  { name: 'rajiv-patel', size: 170, x: 85, y: 5, glow: '#8B5CF6', blur: 45, spread: 7, big: true },
  { name: 'giorgio-rossi', size: 95, x: 90, y: 26, glow: '#5B9BD5', blur: 35, spread: 5 },
  { name: 'john-lin', size: 160, x: 87, y: 42, glow: '#7C9070', blur: 45, spread: 7, big: true },
  { name: 'ayesha-khan', size: 85, x: 91, y: 64, glow: '#8B5CF6', blur: 30, spread: 4 },
  { name: 'carmen-ortiz', size: 150, x: 87.5, y: 79, glow: '#F59E0B', blur: 40, spread: 6, big: true },
  { name: 'francisco-lopez', size: 80, x: 76, y: 87, glow: '#7C9070', blur: 28, spread: 4 },
  { name: 'latoya-williams', size: 95, x: 62.5, y: 84, glow: '#8B5CF6', blur: 32, spread: 4 },
  { name: 'sam-moore', size: 75, x: 50, y: 89, glow: '#5B9BD5', blur: 25, spread: 3 },
  { name: 'jennifer-moore', size: 90, x: 37, y: 86, glow: '#7C9070', blur: 30, spread: 4 },
  { name: 'tamara-taylor', size: 70, x: 25, y: 89, glow: '#F59E0B', blur: 25, spread: 3 },
  { name: 'wolfgang-schulz', size: 85, x: 12.5, y: 84, glow: '#8B5CF6', blur: 30, spread: 4 },
  { name: 'ryan-park', size: 165, x: 2, y: 77, glow: '#5B9BD5', blur: 45, spread: 7, big: true },
  { name: 'yuriko-yamamoto', size: 90, x: 3, y: 61, glow: '#7C9070', blur: 32, spread: 4 },
  { name: 'arthur-burton', size: 155, x: 1.4, y: 39, glow: '#8B5CF6', blur: 45, spread: 7, big: true },
  { name: 'maria-lopez', size: 80, x: 3.5, y: 24, glow: '#F59E0B', blur: 28, spread: 4 },
];

export default function LandingPage() {
  const router = useRouter();

  const handleTryNow = () => {
    router.push('/start');
  };

  return (
    <main className="relative w-full min-h-screen bg-[#08080F] overflow-hidden">
      {/* Background gradient glows */}
      <div
        className="absolute w-[70%] h-[70%] left-[10%] top-[20%] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, rgba(124, 144, 112, 0.15) 0%, transparent 70%)' }}
      />
      <div
        className="absolute w-[60%] h-[60%] right-0 top-[40%] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, rgba(139, 92, 246, 0.12) 0%, transparent 70%)' }}
      />

      {/* Avatars */}
      {avatars.map((avatar) => (
        <div
          key={avatar.name}
          className="absolute rounded-full bg-cover bg-center z-10"
          style={{
            width: avatar.size,
            height: avatar.size,
            left: `${avatar.x}%`,
            top: `${avatar.y}%`,
            backgroundImage: `url(/avatars/${avatar.name}.png)`,
            boxShadow: avatar.big
              ? `0 0 ${avatar.blur}px ${avatar.spread}px ${avatar.glow}, 0 0 ${avatar.blur * 1.6}px ${avatar.spread * 2}px ${avatar.glow}50`
              : `0 0 ${avatar.blur}px ${avatar.spread}px ${avatar.glow}80`,
          }}
        />
      ))}

      {/* Center Content */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-6 z-20 text-center px-4">
        <span className="text-lg font-semibold text-[#7C9070] tracking-[2px] uppercase">
          Simuul
        </span>

        <h1 className="text-4xl md:text-6xl font-extrabold text-white leading-tight">
          Simulate your users
        </h1>

        <h2 className="text-4xl md:text-6xl font-extrabold text-[#7C9070] leading-tight -mt-2">
          before you ship
        </h2>

        <p className="text-base md:text-lg text-white/65 max-w-[580px] leading-relaxed">
          Test pricing changes, feature launches, and PR disasters with 200 AI
          users in 30 seconds. No surveys. No waiting. Just answers.
        </p>

        {/* CTA Button */}
        <button
          onClick={handleTryNow}
          className="px-10 py-4 rounded-full text-white text-base font-semibold transition-all hover:-translate-y-0.5 hover:scale-105 mt-2"
          style={{
            background: 'linear-gradient(180deg, #7C9070 0%, #5A7050 100%)',
            boxShadow: '0 0 20px rgba(124, 144, 112, 0.4), 0 0 40px rgba(124, 144, 112, 0.2)'
          }}
        >
          Try Now →
        </button>

        {/* Footer Stats */}
        <div className="flex items-center gap-4 sm:gap-8 mt-2 flex-wrap justify-center">
          <span className="text-xs sm:text-sm text-white/40">200 AI agents</span>
          <span className="text-xs sm:text-sm text-white/25 hidden sm:inline">•</span>
          <span className="text-xs sm:text-sm text-white/40">Real personalities</span>
          <span className="text-xs sm:text-sm text-white/25 hidden sm:inline">•</span>
          <span className="text-xs sm:text-sm text-white/40">Instant feedback</span>
        </div>
      </div>
    </main>
  );
}
