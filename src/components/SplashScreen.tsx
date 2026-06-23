'use client';
import { useEffect, useState } from 'react';

const VERSION = '0.4.0';

// Logo SVG: red rounded rect + white eye + play triangle (app brand mark)
function LogoMark({ size = 72 }: { size?: number }) {
  const h = Math.round(size * 0.78);
  return (
    <svg width={size} height={h} viewBox="0 0 72 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="72" height="56" rx="12" fill="#FF0000" />
      <path
        d="M36 14C22 14 12 28 12 28C12 28 22 42 36 42C50 42 60 28 60 28C60 28 50 14 36 14Z"
        fill="white"
      />
      <circle cx="36" cy="28" r="9" fill="#FF0000" />
      <path d="M33 24L42 28L33 32V24Z" fill="white" />
    </svg>
  );
}

export default function SplashScreen() {
  const [phase, setPhase] = useState<'show' | 'fade' | 'done'>('show');

  useEffect(() => {
    if (sessionStorage.getItem('splash_shown')) {
      setPhase('done');
      return;
    }
    const t1 = setTimeout(() => setPhase('fade'), 2200);
    const t2 = setTimeout(() => {
      setPhase('done');
      sessionStorage.setItem('splash_shown', '1');
    }, 2700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (phase === 'done') return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none transition-opacity duration-500 ${
        phase === 'fade' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* 배경: 3D 도시 이미지 + 다크 레드 오버레이 */}
      <div
        className="absolute inset-0 bg-red-950 bg-cover bg-center"
        style={{ backgroundImage: "url('/splash-bg.jpg')" }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-red-950/50 via-black/30 to-black/70" />

      {/* 로고 + 앱명 + 서브타이틀 */}
      <div className="relative z-10 flex flex-col items-center gap-5 text-white">
        <LogoMark size={80} />
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-4xl font-bold tracking-tight">맛튜버맵</h1>
          <p className="text-sm text-white/60 tracking-wide">내가 구독한 맛튜버들의 맛집 지도</p>
        </div>
      </div>

      {/* 하단 버전 안내 */}
      <div className="absolute bottom-12 flex items-center gap-2 text-white/35 text-xs">
        <LogoMark size={14} />
        <span>맛튜버맵 v{VERSION}</span>
      </div>
    </div>
  );
}
