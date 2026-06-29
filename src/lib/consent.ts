import type { SupabaseClient } from '@supabase/supabase-js'
import { YOUTUBE_OAUTH_SCOPE } from '@/lib/googleOAuth'
import { TERMS_VERSION } from '@/lib/legal'

export type ConsentEvent = 'signup' | 'reactivate' | 'reconnect'

// 동의 로그 append (append-only). ★ 절대 throw하지 않음 — 가입/재연동이 동의 로그 실패로
// 막히면 안 되므로 내부 try/catch로 모두 삼키고 console.error만 남긴다.
// user_id는 호출부가 가진 현재 로그인 사용자 id를 그대로 넣어 RLS "insert own consent"
// (auth.uid() = user_id) 통과. 반드시 사용자 인증된 supabase 클라이언트로 호출할 것.
export async function logConsent(
  supabase: SupabaseClient,
  params: { userId: string; partnerId: string; channelId: string; event: ConsentEvent }
): Promise<void> {
  try {
    const { error } = await supabase.from('consent_logs').insert({
      user_id: params.userId,
      partner_id: params.partnerId,
      channel_id: params.channelId,
      event: params.event,
      consent_type: 'implied',          // 명시 체크박스 아닌 고지 후 진행(implied)
      terms_version: TERMS_VERSION,      // 단일 출처 상수
      oauth_scope: YOUTUBE_OAUTH_SCOPE,  // 부여한 OAuth scope
      // consent_kinds, granted_at은 DB 기본값 사용
    })
    if (error) console.error('[logConsent] insert failed:', params.event, error.message)
  } catch (e) {
    console.error('[logConsent] unexpected error:', e)
  }
}
