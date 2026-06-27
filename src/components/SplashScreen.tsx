'use client';
import { useEffect, useState } from 'react';
import { PinPlayIcon } from '@/components/BrandLogo';

const VERSION = '0.4.0';

function MapGridBg() {
  return (
    <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="minor" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#4A7FA5" strokeWidth="0.4" strokeOpacity="0.5" />
        </pattern>
        <pattern id="major" width="160" height="160" patternUnits="userSpaceOnUse">
          <rect width="160" height="160" fill="url(#minor)" />
          <path d="M 160 0 L 0 0 0 160" fill="none" stroke="#4A7FA5" strokeWidth="1" strokeOpacity="0.9" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#major)" opacity="0.09" />
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
      style={{ backgroundColor: '#0F1C2E' }}
    >
      <MapGridBg />

      {/* 아이콘 뒤 코랄 글로우 */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 320,
          height: 320,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,92,92,0.10) 0%, transparent 68%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -56%)',
        }}
      />

      {/* 메인 콘텐츠 */}
      <div className="relative z-10 flex flex-col items-center gap-8">
        <PinPlayIcon size={76} />

        <div className="flex flex-col items-center gap-3">
          {/* 서비스명 */}
          <h1
            className="text-3xl font-bold"
            style={{ color: '#FFFFFF', letterSpacing: '0.2em' }}
          >
            MAPTUBE
          </h1>

          {/* 코랄 구분선 */}
          <div style={{ width: 36, height: 2, backgroundColor: '#FF5C5C', borderRadius: 1 }} />

          {/* 메인 카피 */}
          <p
            className="text-base font-medium"
            style={{ color: 'rgba(255,255,255,0.90)' }}
          >
            영상 속 장소를 지도로
          </p>

          {/* 서브 카피 */}
          <p
            className="text-xs text-center leading-5"
            style={{ color: 'rgba(255,255,255,0.38)', maxWidth: 220 }}
          >
            맛집 · 카페 · 여행 · 숙소<br />
            유튜버 콘텐츠를 지도에서 발견하세요
          </p>
        </div>
      </div>

      {/* 하단 버전 */}
      <div
        className="absolute bottom-10 text-xs"
        style={{ color: 'rgba(255,255,255,0.18)' }}
      >
        v{VERSION}
      </div>
    </div>
  );
}
