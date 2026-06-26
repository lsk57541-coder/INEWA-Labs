import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getVideoSnippet, extractPlaceList, extractWithClaude } from '@/lib/extractPlaces'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const videoId = request.nextUrl.searchParams.get('videoId')
  if (!videoId) return NextResponse.json({ error: 'Missing videoId param' }, { status: 400 })

  const snippet = await getVideoSnippet(videoId)
  if (!snippet) return NextResponse.json({ error: '영상을 찾을 수 없습니다' }, { status: 404 })

  // 리스트/챕터 정규식 추출(가게명 나열 + 타임스탬프 머지) 우선, 둘 다 비면 AI 폴백.
  let places = extractPlaceList(snippet.title, snippet.description)
  if (places.length === 0) {
    places = await extractWithClaude(snippet.title, snippet.description)
  }

  return NextResponse.json({ places })
}
