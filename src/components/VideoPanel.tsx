'use client'

import type { Location, Video } from '@/types'

interface VideoPanelProps {
  location: Location
  videos: Video[]
  onClose: () => void
}

export default function VideoPanel({ location, videos, onClose }: VideoPanelProps) {
  return (
    <div className="w-80 h-full bg-white border-l flex flex-col shadow-lg shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <p className="font-semibold text-sm">{location.name}</p>
          <p className="text-xs text-gray-400">{location.address}</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-700 text-xl leading-none"
          aria-label="닫기"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {videos.length === 0 ? (
          <p className="text-center text-gray-400 text-sm mt-10">등록된 영상이 없습니다</p>
        ) : (
          <ul className="divide-y">
            {videos.map((v) => (
              <li key={v.id}>
                <a
                  href={`https://www.youtube.com/watch?v=${v.youtube_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-3 p-3 hover:bg-gray-50 transition"
                >
                  <img
                    src={v.thumbnail}
                    alt={v.title}
                    className="w-28 h-16 object-cover rounded shrink-0"
                  />
                  <div className="flex flex-col gap-1 overflow-hidden">
                    <p className="text-xs font-medium line-clamp-2 leading-snug">{v.title}</p>
                    <p className="text-xs text-gray-400 truncate">{v.channel}</p>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
