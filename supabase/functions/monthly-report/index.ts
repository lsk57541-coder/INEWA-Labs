// Supabase Edge Function — sends each opted-in, approved partner their
// previous month's click/place stats. Deploy + schedule per
// supabase/sql/monthly_report_cron.sql (this isn't wired up automatically;
// see that file's comments for the manual setup steps).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.1'

const CONTACT_EMAIL = 'inewalabs@gmail.com'

interface Partner {
  id: string
  user_id: string
  channel_name: string
}

function lastMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const end = new Date(now.getFullYear(), now.getMonth(), 1)
  return { start, end, label: `${start.getFullYear()}년 ${start.getMonth() + 1}월` }
}

async function sendReportEmail(resendApiKey: string, to: string, channelName: string, html: string) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'AI맵튜브 <onboarding@resend.dev>',
      to,
      subject: `[AI맵튜브] ${channelName} 월간 리포트`,
      html,
    }),
  })
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const resendApiKey = Deno.env.get('RESEND_API_KEY')

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const { start, end, label } = lastMonthRange()

  const { data: partners } = await supabase
    .from('partners')
    .select('id, user_id, channel_name')
    .eq('status', 'approved')
    .eq('monthly_report_opt_in', true)

  const results: { partnerId: string; sent: boolean }[] = []

  for (const partner of (partners ?? []) as Partner[]) {
    const { count: placeCount } = await supabase
      .from('places')
      .select('id', { count: 'exact', head: true })
      .eq('partner_id', partner.id)
      .eq('status', 'active')

    const { count: clickCount } = await supabase
      .from('place_clicks')
      .select('id, places!inner(partner_id)', { count: 'exact', head: true })
      .eq('places.partner_id', partner.id)
      .gte('clicked_at', start.toISOString())
      .lt('clicked_at', end.toISOString())

    const { data: topPlaces } = await supabase
      .from('places')
      .select('name, click_count')
      .eq('partner_id', partner.id)
      .order('click_count', { ascending: false })
      .limit(3)

    if (!resendApiKey) {
      results.push({ partnerId: partner.id, sent: false })
      continue
    }

    const { data: userResult } = await supabase.auth.admin.getUserById(partner.user_id)
    const email = userResult.user?.email
    if (!email) {
      results.push({ partnerId: partner.id, sent: false })
      continue
    }

    const topPlacesHtml = (topPlaces ?? [])
      .map((p, i) => `<li>${i + 1}. ${p.name} (클릭 ${p.click_count}회)</li>`)
      .join('')

    await sendReportEmail(
      resendApiKey,
      email,
      partner.channel_name,
      `
        <p><strong>${label}</strong> ${partner.channel_name} 채널 리포트입니다.</p>
        <p>지도에 표시된 장소: ${placeCount ?? 0}개</p>
        <p>지도 클릭 수: ${clickCount ?? 0}회</p>
        <p>인기 장소 TOP3</p>
        <ol>${topPlacesHtml || '<li>데이터 없음</li>'}</ol>
        <p>문의: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
      `
    )
    results.push({ partnerId: partner.id, sent: true })
  }

  return new Response(JSON.stringify({ sent: results.filter((r) => r.sent).length, total: results.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
