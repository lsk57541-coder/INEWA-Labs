import React from 'react'

type P = { className?: string }
const base = (className = 'w-4 h-4') => ({
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className,
})

export const SearchIcon = ({ className }: P) => (
  <svg {...base(className)}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
)
export const MenuIcon = ({ className }: P) => (
  <svg {...base(className)}><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>
)
export const ChevronRight = ({ className }: P) => (
  <svg {...base(className)}><polyline points="9 6 15 12 9 18" /></svg>
)
export const ChevronDown = ({ className }: P) => (
  <svg {...base(className)}><polyline points="6 9 12 15 18 9" /></svg>
)
export const SlidersIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <line x1="4" y1="7" x2="20" y2="7" /><circle cx="9" cy="7" r="2.3" fill="#fff" />
    <line x1="4" y1="12" x2="20" y2="12" /><circle cx="15" cy="12" r="2.3" fill="#fff" />
    <line x1="4" y1="17" x2="20" y2="17" /><circle cx="11" cy="17" r="2.3" fill="#fff" />
  </svg>
)
export const GridIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
)
export const KeywordIcon = SearchIcon
export const ChannelIcon = ({ className }: P) => (
  <svg {...base(className)}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="8" y1="22" x2="16" y2="22" /></svg>
)

const catSvg = (children: React.ReactNode, className = 'w-[22px] h-[22px]') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
       strokeLinecap="round" strokeLinejoin="round" className={className}>{children}</svg>
)
export const CATEGORY_ICONS: Record<string, (c?: string) => React.ReactNode> = {
  all:     (c) => catSvg(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.2" /></>, c),
  cafe:    (c) => catSvg(<><path d="M4 9h13v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9z" /><path d="M17 10h2.5a2.5 2.5 0 0 1 0 5H17" /><path d="M8 3v2M12 3v2" /></>, c),
  bar:     (c) => catSvg(<><path d="M6 4h9l-1 5.5a3.5 3.5 0 0 1-3.5 3H10.5A3.5 3.5 0 0 1 7 9.5L6 4z" /><path d="M15 5.5h2.5a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H14.5" /><path d="M9 12.5V20M7 20h4" /></>, c),
  meat:    (c) => catSvg(<><path d="M13.5 3.5a5.5 5.5 0 0 0-7.6 7.8l1.6 1.6" /><circle cx="9" cy="9" r="4.2" /><path d="M12 12l7 7" /><path d="M19 19l1.5-.4-.4-1.5" /></>, c),
  seafood: (c) => catSvg(<><path d="M3 12c3-5 9-6 13-3 2 1.5 4 3 5 3-1 0-3 1.5-5 3-4 3-10 2-13-3z" /><path d="M14 9l3-3M14 15l3 3" /><circle cx="8" cy="11" r=".6" fill="currentColor" /></>, c),
  stay:    (c) => catSvg(<><path d="M4 21V6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v3h4a1 1 0 0 1 1 1v11" /><path d="M3 21h18" /><path d="M8 9h3M8 13h3M18 13h1M18 17h1" /></>, c),
  tour:    (c) => catSvg(<><path d="M3 19h18" /><path d="M5 19l5-9 3 5 2-3 4 7" /><circle cx="17" cy="6" r="1.6" /></>, c),
  world:   (c) => catSvg(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>, c),
  korean:  (c) => catSvg(<><path d="M3 11h18a9 9 0 0 1-18 0z" /><path d="M9 3.5c-.6 1 .6 2 0 3M13 3c-.6 1 .6 2 0 3" /><path d="M2 20h20" /></>, c),
  기타:    (c) => catSvg(<><circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none" /></>, c),
}
export const CategoryIcon = ({ k, className }: { k: string; className?: string }) =>
  <>{(CATEGORY_ICONS[k] ?? CATEGORY_ICONS.all)(className)}</>
