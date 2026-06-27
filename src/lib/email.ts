import { Resend } from 'resend'

const CONTACT_EMAIL = 'inewalabs@gmail.com'
const DASHBOARD_URL = 'https://aimaptube.vercel.app/partner/dashboard'
const LOGO_URL = 'https://aimaptube.vercel.app/icon-192.png'

// 이메일 클라이언트 호환을 위해 테이블 기반 인라인 스타일. 로고는 절대 URL(SVG/인라인 불가).
// 네이비 배경 + 로고 + MAPTUBE + 코랄선 + 슬로건 — 웹/메뉴/OG와 통일.
function brandHeader(): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background-color:#0F1C2E;border-radius:12px 12px 0 0">
      <tr><td style="padding:24px 24px 20px 24px;text-align:center">
        <img src="${LOGO_URL}" width="44" height="44" alt="MAPTUBE" style="display:inline-block;border:0;border-radius:10px" />
        <div style="margin-top:10px;font-size:20px;font-weight:700;letter-spacing:2px;color:#ffffff;font-family:Arial,Helvetica,sans-serif">MAPTUBE</div>
        <div style="width:28px;height:2px;background-color:#FF5C5C;border-radius:1px;margin:10px auto 8px auto"></div>
        <div style="font-size:13px;color:rgba(255,255,255,0.78);font-family:Arial,Helvetica,sans-serif">영상 속 장소를 지도로</div>
      </td></tr>
    </table>
    <div style="height:16px"></div>`
}

export async function sendPartnerApplicationEmail(to: string, channelName: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const resend = new Resend(apiKey)
  await resend.emails.send({
    from: 'AI맵튜브 <onboarding@resend.dev>',
    to,
    subject: 'AI맵튜브 파트너 신청이 접수되었습니다',
    html: `
      ${brandHeader()}
      <p>안녕하세요, <strong>${channelName}</strong> 채널 파트너 신청이 접수되었습니다.</p>
      <p>영업일 기준 3~5일 내에 검토 후 결과를 안내드립니다.</p>
      <p>문의사항은 <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>로 연락해주세요.</p>
    `,
  })
}

const GRADE_LABEL: Record<string, string> = { general: '일반', premium: '프리미엄' }

export async function sendPartnerApprovedEmail(to: string, channelName: string, grade: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const resend = new Resend(apiKey)
  await resend.emails.send({
    from: 'AI맵튜브 <onboarding@resend.dev>',
    to,
    subject: '🎉 AI맵튜브 파트너 승인을 축하합니다',
    html: `
      ${brandHeader()}
      <p><strong>${channelName}</strong> 채널의 AI맵튜브 파트너 신청이 승인되었습니다. 축하합니다!</p>
      <p>등급: <strong>${GRADE_LABEL[grade] ?? grade}</strong></p>
      <p><a href="${DASHBOARD_URL}">내 파트너 현황 보기</a></p>
      <p>문의사항은 <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>로 연락해주세요.</p>
    `,
  })
}

// Unlike the partner-flow emails above (best-effort, failure is silently
// swallowed by the caller), outreach sends report success/failure back —
// the caller must not flip status to 'sent' if the email never went out.
export async function sendOutreachEmail(to: string, subject: string, body: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return false

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    from: 'AI맵튜브 <onboarding@resend.dev>',
    to,
    subject,
    html: body.split('\n').map((line) => `<p>${line.trim() ? line : '&nbsp;'}</p>`).join(''),
  })
  return !error
}

export async function sendOutreachFollowUpEmail(to: string, channelName: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return false

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    from: 'AI맵튜브 <onboarding@resend.dev>',
    to,
    subject: `[AI MAPTUBE] ${channelName} 채널 파트너십 제안 - 다시 안내드립니다`,
    html: `
      <p>안녕하세요, <strong>${channelName}</strong> 채널 운영자님.</p>
      <p>지난번 보내드린 AI MAPTUBE 파트너십 제안에 대해 다시 한번 안내드립니다.</p>
      <p>궁금한 점이 있으시면 언제든 회신 부탁드립니다.</p>
      <p>👉 파트너 신청: <a href="https://maptube.ai/partner/apply">https://maptube.ai/partner/apply</a></p>
      <p>감사합니다. AI MAPTUBE 팀 드림</p>
    `,
  })
  return !error
}

export async function sendPartnerRejectedEmail(to: string, channelName: string, reason: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const resend = new Resend(apiKey)
  await resend.emails.send({
    from: 'AI맵튜브 <onboarding@resend.dev>',
    to,
    subject: 'AI맵튜브 파트너 신청 결과 안내',
    html: `
      ${brandHeader()}
      <p>안녕하세요, <strong>${channelName}</strong> 채널의 AI맵튜브 파트너 신청을 신중히 검토했지만, 이번에는 함께하지 못하게 되어 아쉬운 마음을 전합니다.</p>
      <p>거절 사유: ${reason}</p>
      <p>아래 사항을 보완하신 후 언제든 다시 신청해주세요.</p>
      <p>문의사항은 <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>로 연락해주세요.</p>
    `,
  })
}
