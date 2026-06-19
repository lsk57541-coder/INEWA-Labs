import { Resend } from 'resend'

const CONTACT_EMAIL = 'inewalabs@gmail.com'

export async function sendPartnerApplicationEmail(to: string, channelName: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const resend = new Resend(apiKey)
  await resend.emails.send({
    from: 'AI맵튜브 <onboarding@resend.dev>',
    to,
    subject: 'AI맵튜브 파트너 신청이 접수되었습니다',
    html: `
      <p>안녕하세요, <strong>${channelName}</strong> 채널 파트너 신청이 접수되었습니다.</p>
      <p>영업일 기준 3~5일 내에 검토 후 결과를 안내드립니다.</p>
      <p>문의사항은 <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>로 연락해주세요.</p>
    `,
  })
}
