'use client'

import { useState, useRef } from 'react'
import Script from 'next/script'
import { addLocation } from '@/app/actions'
import { useRouter } from 'next/navigation'

export default function LocationForm() {
  const router = useRouter()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<kakao.maps.Map | null>(null)
  const markerRef = useRef<kakao.maps.Marker | null>(null)

  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const initMap = () => {
    if (!mapRef.current || !window.kakao) return
    kakao.maps.load(() => {
      const options: kakao.maps.MapOptions = {
        center: new kakao.maps.LatLng(37.5665, 126.978),
        level: 7,
      }
      mapInstanceRef.current = new kakao.maps.Map(mapRef.current!, options)
      kakao.maps.event.addListener(mapInstanceRef.current, 'click', (...args: unknown[]) => {
        const e = args[0] as kakao.maps.MouseEvent
        const latlng = e.latLng
        setLat(latlng.getLat().toFixed(6))
        setLng(latlng.getLng().toFixed(6))
        if (markerRef.current) markerRef.current.setMap(null)
        markerRef.current = new kakao.maps.Marker({ position: latlng, map: mapInstanceRef.current! })
      })
    })
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setPending(true)
    try {
      const formData = new FormData(e.currentTarget)
      await addLocation(formData)
      router.push('/admin')
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Script
        src={`//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY}&autoload=false`}
        onLoad={initMap}
      />
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">장소명 *</label>
          <input name="name" required placeholder="예: 경복궁" className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">주소</label>
          <input name="address" placeholder="예: 서울 종로구 사직로 161" className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">설명</label>
          <textarea name="description" rows={2} placeholder="장소에 대한 간단한 설명" className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">좌표 (지도를 클릭해서 선택) *</label>
          <div ref={mapRef} className="w-full h-52 rounded-lg border mb-2" />
          <div className="flex gap-2">
            <input
              name="lat"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              required
              placeholder="위도 (예: 37.5797)"
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
            />
            <input
              name="lng"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              required
              placeholder="경도 (예: 126.9771)"
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 border rounded-lg py-2 text-sm hover:bg-gray-50 transition"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 bg-black text-white rounded-lg py-2 text-sm hover:bg-gray-800 transition disabled:opacity-50"
          >
            {pending ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </>
  )
}
