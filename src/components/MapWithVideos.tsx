'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import KakaoMap from '@/components/map/KakaoMap'
import VideoPanel from '@/components/VideoPanel'
import type { Location, Video } from '@/types'

interface MapWithVideosProps {
  locations: Location[]
}

export default function MapWithVideos({ locations }: MapWithVideosProps) {
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null)
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(false)

  const handleMarkerClick = async (location: Location) => {
    setSelectedLocation(location)
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('videos')
      .select('*')
      .eq('location_id', location.id)
      .order('created_at', { ascending: false })
    setVideos(data ?? [])
    setLoading(false)
  }

  const handleClose = () => {
    setSelectedLocation(null)
    setVideos([])
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 relative">
        <KakaoMap locations={locations} onMarkerClick={handleMarkerClick} />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/40 pointer-events-none">
            <span className="text-sm text-gray-500">불러오는 중…</span>
          </div>
        )}
      </div>
      {selectedLocation && !loading && (
        <VideoPanel
          location={selectedLocation}
          videos={videos}
          onClose={handleClose}
        />
      )}
    </div>
  )
}
