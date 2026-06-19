'use client'

import { useActionState, useState } from 'react'
import { PARTNER_CATEGORIES, KOREA_REGIONS } from '@/lib/partnerOptions'
import type { PublicChannelInfo } from '@/lib/partnerPendingChannel'
import { submitPartnerApplication, type SubmitState } from './actions'

export default function PartnerApplyForm({ channel }: { channel: PublicChannelInfo | null }) {
  const [categories, setCategories] = useState<string[]>([])
  const [region, setRegion] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [state, formAction, pending] = useActionState<SubmitState, FormData>(submitPartnerApplication, {})

  const toggleCategory = (c: string) => {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  const canSubmit = !!channel && categories.length > 0 && !!region && agreed && !pending

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <p className="text-sm font-medium mb-2">YouTube 채널 연동</p>
        {channel ? (
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 text-sm">
            <span className="font-medium">✅ {channel.channelName}</span>
            <span className="text-gray-500">구독자 {channel.subscriberCount.toLocaleString()}명</span>
          </div>
        ) : (
          <a
            href="/api/auth/youtube/start"
            className="block text-center bg-red-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-red-700 transition"
          >
            ▶ YouTube 채널 연동하기
          </a>
        )}
      </div>

      <div>
        <p className="text-sm font-medium mb-2">콘텐츠 카테고리 (복수 선택 가능)</p>
        <div className="flex flex-wrap gap-2">
          {PARTNER_CATEGORIES.map((c) => (
            <label
              key={c}
              className={`text-sm px-3 py-1.5 rounded-full border cursor-pointer transition ${
                categories.includes(c) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-200'
              }`}
            >
              <input
                type="checkbox"
                name="categories"
                value={c}
                checked={categories.includes(c)}
                onChange={() => toggleCategory(c)}
                className="hidden"
              />
              {c}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-2">주요 활동 지역</p>
        <select
          name="region"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="w-full text-sm border rounded-lg px-3 py-2.5 bg-white"
        >
          <option value="">지역을 선택해주세요</option>
          {KOREA_REGIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          name="agree"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5"
        />
        <span>영상 자막 데이터를 장소 인식 정확도 개선에 활용하는 것에 동의합니다. (필수)</span>
      </label>

      {state.error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{state.error}</p>}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full bg-black text-white rounded-lg py-3 text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition"
      >
        {pending ? '제출 중…' : '파트너 신청하기'}
      </button>
    </form>
  )
}
