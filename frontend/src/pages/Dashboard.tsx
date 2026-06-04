import { Users, Send, FileText, TrendingUp } from 'lucide-react'
import { useFetch } from '../hooks/useApi'
import StatusBadge from '../components/StatusBadge'
import { PageSkeleton } from '../components/LoadingSkeleton'

/* ── Types ── */
interface DashboardData {
  activeAccounts: number
  todayPosts: number
  todaySuccess: number
  todayFailed: number
  pendingContent: number
  successRate: number
}

interface PostingLive {
  time: string
  accountName: string
  keyword: string
  tone: string
  status: string
}

interface TierData {
  tier: number
  label: string
  count: number
}

/* ── Stat Card ── */
interface StatCardProps {
  title: string
  value: string | number
  subtext: string
  icon: React.ReactNode
}

function StatCard({ title, value, subtext, icon }: StatCardProps) {
  return (
    <div className="glass-panel rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">{title}</span>
        {icon}
      </div>
      <p className="text-3xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
    </div>
  )
}

/* ── Tier bar colors ── */
const tierBarColor: Record<number, string> = {
  1: 'bg-muted-foreground',
  2: 'bg-primary',
  3: 'bg-violet-500',
  4: 'bg-amber',
  5: 'bg-emerald',
}

const defaultStats: DashboardData = {
  activeAccounts: 0,
  todayPosts: 0,
  todaySuccess: 0,
  todayFailed: 0,
  pendingContent: 0,
  successRate: 0,
}

export default function Dashboard() {
  const { data: dashboard, loading: dashLoading } = useFetch<DashboardData>('/stats/dashboard')
  const { data: postings, loading: postLoading } = useFetch<PostingLive[]>('/stats/posting-live')
  const { data: tiers, loading: tierLoading } = useFetch<TierData[]>('/stats/account-tiers')

  const stats = dashboard || defaultStats
  const postingRows = postings || []
  const tierData = tiers || []

  const isLoading = dashLoading || postLoading || tierLoading
  if (isLoading) return <PageSkeleton />

  const maxCount = Math.max(...tierData.map((t) => t.count), 1)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">대시보드</h1>
          <p className="text-sm text-muted-foreground">블로그 자동 포스팅 시스템 현황</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald" />
          </span>
          System Active
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="활성 계정"
          value={stats.activeAccounts}
          subtext="Naver 계정"
          icon={<Users className="w-5 h-5 text-primary" />}
        />
        <StatCard
          title="오늘 포스팅"
          value={stats.todayPosts}
          subtext={`성공 ${stats.todaySuccess} / 실패 ${stats.todayFailed}`}
          icon={<Send className="w-5 h-5 text-emerald" />}
        />
        <StatCard
          title="대기중 콘텐츠"
          value={stats.pendingContent}
          subtext="예약 발행 대기"
          icon={<FileText className="w-5 h-5 text-amber" />}
        />
        <StatCard
          title="성공률"
          value={`${stats.successRate}%`}
          subtext="최근 7일"
          icon={<TrendingUp className="w-5 h-5 text-secondary" />}
        />
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Posting Status Table */}
        <div className="lg:col-span-2 glass-panel rounded-xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">실시간 포스팅 현황</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="pb-3 font-medium">시간</th>
                  <th className="pb-3 font-medium">계정</th>
                  <th className="pb-3 font-medium">키워드</th>
                  <th className="pb-3 font-medium">톤</th>
                  <th className="pb-3 font-medium">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {postingRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      포스팅 기록이 없습니다
                    </td>
                  </tr>
                ) : (
                  postingRows.map((row, i) => (
                    <tr key={i} className="text-foreground">
                      <td className="py-3 text-muted-foreground">{row.time}</td>
                      <td className="py-3 font-medium">{row.accountName}</td>
                      <td className="py-3 text-muted-foreground">{row.keyword}</td>
                      <td className="py-3">
                        <StatusBadge label={row.tone} />
                      </td>
                      <td className="py-3">
                        <StatusBadge label={row.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Account Tier Distribution */}
        <div className="glass-panel rounded-xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">계정 티어 분포</h2>
          {tierData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">티어 데이터가 없습니다</p>
          ) : (
            <ul className="space-y-4">
              {tierData.map((t) => (
                <li key={t.tier}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-foreground">
                      Tier {t.tier} &mdash; {t.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{t.count}개</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${tierBarColor[t.tier] || 'bg-primary'} transition-all duration-500`}
                      style={{ width: `${(t.count / maxCount) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
