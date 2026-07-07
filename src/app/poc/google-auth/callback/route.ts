import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchOwnChannel, type OwnChannel } from '@/lib/googleOAuth'

// ── 파트너 구글 단독인증 격리 PoC 전용 콜백 ──
// ★ 공유 /auth/callback 을 절대 타지 않는다 (그 콜백은 profiles.upsert + 복귀 리다이렉트).
// ★ profiles / partners 등 라이브 테이블을 전혀 건드리지 않는다.
// ★ 확인이 끝나면 반드시 signOut() 으로 세션을 파기한다 (auth.users 유저 자체는 콘솔에서 삭제).
//
// 실증 목표: "구글 로그인 1회 = Supabase 세션 + youtube.readonly provider_token +
// fetchOwnChannel(mine=true) 채널 소유권 증명" 이 모두 성립하는지 화면에 표시한다.

interface PocResult {
  oauthError?: string          // 구글이 error 파라미터로 돌려준 경우
  exchangeError?: string       // exchangeCodeForSession 실패
  sessionOk: boolean
  userEmail: string | null
  providerTokenPresent: boolean
  providerTokenPreview: string | null
  providerRefreshPresent: boolean
  channel: OwnChannel | null
  channelError: string | null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const errorParam = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  const result: PocResult = {
    sessionOk: false,
    userEmail: null,
    providerTokenPresent: false,
    providerTokenPreview: null,
    providerRefreshPresent: false,
    channel: null,
    channelError: null,
  }

  // 구글 단계에서 실패(동의 거부 등)
  if (errorParam) {
    result.oauthError = `${errorParam}: ${errorDescription ?? ''}`
    return htmlResponse(result)
  }
  if (!code) {
    result.oauthError = 'no_code — 콜백에 code 파라미터가 없습니다.'
    return htmlResponse(result)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session) {
    result.exchangeError = error?.message ?? 'session 없음'
  } else {
    const session = data.session
    result.sessionOk = true
    result.userEmail = session.user.email ?? null

    const providerToken = session.provider_token ?? null
    result.providerTokenPresent = !!providerToken
    result.providerRefreshPresent = !!session.provider_refresh_token
    if (providerToken) {
      // 전체 토큰은 노출하지 않고 존재 증명용 프리뷰만.
      result.providerTokenPreview = `${providerToken.slice(0, 12)}… (len ${providerToken.length})`

      // 기존 자체 흐름과 동일한 함수 재사용 — mine=true 로 "내 채널" 소유권 확인.
      const channel = await fetchOwnChannel(providerToken)
      if (channel) result.channel = channel
      else result.channelError = 'fetchOwnChannel 실패 (scope 미부여 / 토큰 형태 / quota 등 의심)'
    }
  }

  // ★ 라이브 무영향 보장: 확인이 끝났으니 즉시 세션 파기 (실패해도 화면은 계속 표시).
  try {
    await supabase.auth.signOut()
  } catch {
    // 세션 정리 실패는 판정에 영향 없음 — 유저 삭제로 최종 원복.
  }

  return htmlResponse(result)
}

// PoC 라우트 핸들러에서 바로 결과 화면을 그린다(페이지 컴포넌트 추가 없이 2파일 유지).
function htmlResponse(r: PocResult): NextResponse {
  const pass =
    r.sessionOk && r.providerTokenPresent && r.channel !== null
  const verdict = pass
    ? { label: '성립 ✓ — 구글 1회 = 세션 + youtube.readonly + 채널 증명', color: '#1D9E75' }
    : { label: '미성립 ✗ — 아래 실패 항목 확인', color: '#C0392B' }

  const rows: [string, string][] = [
    ['구글 단계 오류', r.oauthError ? esc(r.oauthError) : '없음'],
    ['세션 교환 오류', r.exchangeError ? esc(r.exchangeError) : '없음'],
    ['Supabase 세션 생성', yn(r.sessionOk)],
    ['로그인 이메일', r.userEmail ? esc(r.userEmail) : '—'],
    ['provider_token 수신', yn(r.providerTokenPresent)],
    ['provider_token 미리보기', r.providerTokenPreview ? esc(r.providerTokenPreview) : '—'],
    ['provider_refresh_token 수신', yn(r.providerRefreshPresent)],
    [
      '채널 소유권(fetchOwnChannel mine=true)',
      r.channel
        ? `${esc(r.channel.channelName)} · ${r.channel.subscriberCount.toLocaleString()} 구독 · ${esc(r.channel.channelId)}`
        : r.channelError
          ? esc(r.channelError)
          : '—',
    ],
  ]

  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><th style="text-align:left;padding:10px 14px;border-bottom:1px solid #eee;color:#555;font-weight:600;white-space:nowrap;vertical-align:top">${esc(k)}</th><td style="padding:10px 14px;border-bottom:1px solid #eee;color:#111;word-break:break-all">${v}</td></tr>`,
    )
    .join('')

  const body = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>구글 단독인증 PoC 결과</title></head>
<body style="margin:0;background:#fafafa;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#111">
<div style="max-width:640px;margin:0 auto;padding:32px 20px">
  <p style="font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#999;font-weight:700;margin:0">Isolated PoC · 라이브 무영향</p>
  <h1 style="font-size:20px;margin:6px 0 4px">파트너 구글 단독인증 실증 결과</h1>
  <div style="margin:16px 0;padding:12px 16px;border-radius:10px;background:${verdict.color}14;color:${verdict.color};font-weight:700">${esc(verdict.label)}</div>
  <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #eee;border-radius:10px;overflow:hidden;font-size:14px">${rowsHtml}</table>
  <p style="margin:18px 0 0;font-size:12px;color:#888;line-height:1.6">
    세션은 확인 직후 signOut() 으로 파기되었습니다. auth 풀 원복을 위해
    Supabase → Authentication → Users 에서 이 테스트 유저를 삭제하세요.
    profiles/partners 등 라이브 테이블은 이 흐름에서 전혀 수정되지 않았습니다.
  </p>
  <p style="margin:10px 0 0"><a href="/poc/google-auth" style="color:#2563eb;font-size:13px">← 다시 테스트</a></p>
</div>
</body></html>`

  return new NextResponse(body, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function yn(v: boolean): string {
  return v
    ? '<span style="color:#1D9E75;font-weight:700">예</span>'
    : '<span style="color:#C0392B;font-weight:700">아니오</span>'
}

// 표시값에 채널명/이메일 등 외부 문자열이 섞이므로 XSS 방지용 최소 이스케이프.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
