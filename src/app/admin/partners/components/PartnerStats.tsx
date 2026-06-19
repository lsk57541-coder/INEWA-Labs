'use client'

import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import type { PartnerApplication } from '@/app/actions'

const PIE_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#a855f7', '#ef4444']

// Bucket created_at into the last 6 calendar months, oldest first, so the
// line chart always has a consistent x-axis even for empty months.
function lastSixMonths(): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

export default function PartnerStats({ partners }: { partners: PartnerApplication[] }) {
  const categoryCounts = new Map<string, number>()
  const regionCounts = new Map<string, number>()
  const monthCounts = new Map<string, number>()

  for (const p of partners) {
    for (const c of p.categories) categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1)
    regionCounts.set(p.region, (regionCounts.get(p.region) ?? 0) + 1)
    const month = p.created_at.slice(0, 7)
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1)
  }

  const categoryData = [...categoryCounts.entries()].map(([name, value]) => ({ name, value }))
  const regionData = [...regionCounts.entries()].map(([name, value]) => ({ name, value }))
  const monthData = lastSixMonths().map((month) => ({ month, count: monthCounts.get(month) ?? 0 }))

  return (
    <div className="grid sm:grid-cols-2 gap-4 mb-8">
      <div className="border rounded-lg p-4">
        <p className="text-sm font-medium mb-2">카테고리별 분포</p>
        {categoryData.length === 0 ? (
          <p className="text-xs text-gray-400">데이터 없음</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70}>
                {categoryData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="border rounded-lg p-4">
        <p className="text-sm font-medium mb-2">지역별 분포</p>
        {regionData.length === 0 ? (
          <p className="text-xs text-gray-400">데이터 없음</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={regionData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="border rounded-lg p-4 sm:col-span-2">
        <p className="text-sm font-medium mb-2">월별 신규 파트너 추이</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={monthData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
