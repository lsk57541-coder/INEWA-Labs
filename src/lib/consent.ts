import type { SupabaseClient } from '@supabase/supabase-js'
import { YOUTUBE_OAUTH_SCOPE } from '@/lib/googleOAuth'
import { TERMS_VERSION } from '@/lib/legal'

// consent_logs.event CHECK 허용값과 문자열이 정확히 일치해야 한다(오타 시 CHECK 위반 → 조용한 실패).
export type ConsentEvent =
  | 'signup'
  | 'reactivate'
  | 'reconnect'
  | 'explicit_consent_terms'
  | 'explicit_consent_data'
  | 'succession_notice_shown'

// consent_logs.consent_type CHECK 허용값. succession_notice_shown 은 '동의'가 아니라 '고지'라
// 별도 값이 없어 'implied'로 기록하되, event 명으로 고지임을 구분한다.
export type ConsentType = 'implied' | 'explicit'

// ★ 엄격(strict) 대상 = explicit 필수동의 2종. 이 로그는 곧 법적 증빙이라, 기록 실패를 삼키면
// "동의 없이 활성"이 된다 → 실패 시 throw 로 드러내고, 호출부(C단계 서버액션)가 이를 잡아
// partners 생성을 중단하게 한다. 나머지 4종(signup/reactivate/reconnect/succession_notice_shown)은
// 파트너 생성이 주작업이고 로그는 부수라 기존대로 best-effort(throw 안 함, console.error 관측만).
const STRICT_EVENTS: ReadonlySet<ConsentEvent> = new Set<ConsentEvent>([
  'explicit_consent_terms',
  'explicit_consent_data',
])

// 동의 로그 append (append-only).
// user_id는 호출부가 가진 현재 로그인 사용자 id를 그대로 넣어 RLS "insert own consent"
// (auth.uid() = user_id) 통과. 반드시 사용자 인증된(RLS-bound) supabase 클라이언트로 호출할 것.
// service_role 로 바꾸지 말 것 — explicit 동의는 "본인이 본인 세션에서" 남기는 게 증빙상 자연스럽다.
export async function logConsent(
  supabase: SupabaseClient,
  params: {
    userId: string
    partnerId: string
    channelId: string
    event: ConsentEvent
    // 기본 'implied' — 기존 호출부(signup/reactivate/reconnect)는 인자를 넘기지 않아 무변경.
    // explicit_consent_* 호출부(C단계)만 'explicit' 을 넘긴다.
    consentType?: ConsentType
  }
): Promise<void> {
  const consentType: ConsentType = params.consentType ?? 'implied'
  const strict = STRICT_EVENTS.has(params.event)
  // 실패 추적용 식별자(민감정보 아님 — 토큰류는 여기 없음). 어느 이벤트가 왜 실패했는지 남긴다.
  const ctx = `event=${params.event} user=${params.userId} partner=${params.partnerId} channel=${params.channelId}`

  try {
    // .select()로 실제 반영된 행을 받는다("조용한 누락" 감지). insert 는 RLS WITH CHECK 위반 시
    // 0행이 아니라 에러를 내지만, 관측성/0행 방어를 위해 반환 행수를 함께 확인한다.
    const { data, error } = await supabase
      .from('consent_logs')
      .insert({
        user_id: params.userId,
        partner_id: params.partnerId,
        channel_id: params.channelId,
        event: params.event,
        consent_type: consentType,         // explicit_consent_* → 'explicit', 그 외 → 'implied'
        terms_version: TERMS_VERSION,      // 단일 출처 상수
        oauth_scope: YOUTUBE_OAUTH_SCOPE,  // 부여한 OAuth scope
        // consent_kinds, granted_at은 DB 기본값 사용
      })
      .select('id')

    if (error) {
      // 엄격: 식별가능한 메시지로 throw(호출부가 잡아 partners 생성 중단). 느슨: 기존대로 삼킴.
      if (strict) throw new Error(`[logConsent] insert failed (${ctx}): ${error.message}`)
      console.error(`[logConsent] insert failed (${ctx}):`, error.message)
      return
    }

    if ((data?.length ?? 0) !== 1) {
      // 에러는 없는데 0행 — RLS 등으로 조용히 누락됐거나 반환행이 안 잡힌 경우.
      if (strict) throw new Error(`[logConsent] insert affected ${data?.length ?? 0} rows (${ctx})`)
      console.error(`[logConsent] insert affected ${data?.length ?? 0} rows (${ctx})`)
    }
  } catch (e) {
    // 엄격 이벤트의 예외는 반드시 위로 전파(증빙 실패를 삼키지 않는다).
    if (strict) throw e
    console.error(`[logConsent] unexpected error (${ctx}):`, e instanceof Error ? e.message : e)
  }
}
