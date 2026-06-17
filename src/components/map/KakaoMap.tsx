'use client'

import { useEffect, useRef } from 'react'
import Script from 'next/script'
import type { Location } from '@/types'

interface KakaoMapProps {
  locations?: Location[]
  onMarkerClick?: (location: Location) => void
  center?: { lat: number; lng: number }
  level?: number
}

export default function KakaoMap({
  locations = [],
  onMarkerClick,
  center = { lat: 37.5665, lng: 126.978 },
  level = 7,
}: KakaoMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<kakao.maps.Map | null>(null)
  const markersRef = useRef<kakao.maps.Marker[]>([])

  const initMap = () => {
    if (!mapRef.current || !window.kakao) return

    kakao.maps.load(() => {
      const options: kakao.maps.MapOptions = {
        center: new kakao.maps.LatLng(center.lat, center.lng),
        level,
      }
      mapInstanceRef.current = new kakao.maps.Map(mapRef.current!, options)
      renderMarkers()
    })
  }

  const renderMarkers = () => {
    if (!mapInstanceRef.current) return

    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = []

    locations.forEach((loc) => {
      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(loc.lat, loc.lng),
        map: mapInstanceRef.current!,
      })

      if (onMarkerClick) {
        kakao.maps.event.addListener(marker, 'click', () => onMarkerClick(loc))
      }

      markersRef.current.push(marker)
    })
  }

  useEffect(() => {
    if (window.kakao && mapInstanceRef.current) {
      renderMarkers()
    }
  }, [locations])

  return (
    <>
      <Script
        src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY}&autoload=false`}
        onLoad={initMap}
      />
      <div ref={mapRef} className="w-full h-full" />
    </>
  )
}
