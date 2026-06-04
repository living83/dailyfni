import {
  RefreshCw,
  Calendar,
  FileText,
  CheckCircle2,
  XCircle,
  TrendingUp,
  ExternalLink,
} from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { useFetch } from '../hooks/useApi'
import StatusBadge from '../components/StatusBadge'
import { PageSkeleton } from '../components/LoadingSkeleton'

/* ── Types ── */
type PostStatus = '발행완료' | '저품질' | '실패'
type Grade = 'A' | 'B' | 'C' | 'D'

interface MonitoringStats {
  total: number
  success: number
  failed: number
  successRate: number
}

interface AccountPerformance {
  accountName: string
  tier: number
  totalPosts: number
  success: number
  failed: number
  successRate: number
}

interface TierPosting {
  tier: number
  label: string
  general: number
  ad: number
}

interface PostingRecord {
  date: string
  account: string
  keyword: string
  title: string
  tone: string
  status: PostStatus
  quality: Grade
  link: string | null
}

interface PostingRecordsResponse {
  records: PostingRecord[]
  total: number
}

/* ── Helpers ── */
function rateColor(rate: number) {
  if (rate >= 95) return 'text-emerald'
  if (rate >= 85) return 'text-amber'
  return 'text-destructive'
}

const tierBarColor: Record<number, string> = {
  1: 'bg-muted-foreground',
  2: 'bg-primary',
  3: 'bg-violet-500',
  4: 'bg-amber',
  5: 'bg-emerald',
}

const tierDotColor: Record<number, string> = {
  1: 'bg-muted-foreground',
  2: 'bg-primary',
  3: 'bg-violet-500',
  4: 'bg-amber',
  5: 'bg-emerald',
}

const gradeStyle: Record<string, string> = {
  A: 'bg-emerald/15 text-emerald',
  B: 'bg-primary/15 text-primary',
  C: 'bg-amber/15 text-amber',
  D: 'bg-destructive/15 text-destructive',
}

const defaultStats: MonitoringStats = { total: 0, success: 0, failed: 0, successRate: 0 }

/* ── Component ── */
export default function Monitoring() {
  const { addToast } = useToast()

  const { data: monitoringData, loading: monLoading, refetch: refetchMon } = useFetch<MonitoringStats>('/stats/monitoring')
  const { data: accountData, loading: accLoading, refetch: refetchAcc } = useFetch<AccountPerformance[]>('/stats/account-performance')
  const { data: tierData, loading: tierLoading, refetch: refetchTier } = useFetch<TierPosting[]>('/stats/tier-posting')
  const { data: recordsData, loading: recLoading, refetch: refetchRec } = useFetch<PostingRecordsResponse>('/stats/posting-records')

  const stats = monitoringData || defaultStats
  const accountPerformance = accountData || []
  const tierStats = tierData || []
  const postingRecords = recordsData?.records || []

  const isLoading = monLoading || accLoading || tierLoading || recLoading

  const handleRefresh = () => {
    refetchMon()
    refetchAcc()
    refetchTier()
    refetchRec()
    addToast('데이터를 새로고침합니다', 'info')
  }

  if (isLoading) return <PageSkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">모니터링 대시보드</h1>
          <p className="text-sm text-muted-foreground">포스팅 성과와 계정 현황을 한눈에 확인합니다</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-white/[0.03] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            새로고침
          </button>
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            최근 7일
          </span>
        </div>
      </div>

      {/* Top Stats Bar */}
      <div className="glass-panel rounded-xl p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">전체 포스팅</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.total}건</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald" />
              <span className="text-sm text-muted-foreground">성공</span>
            </div>
            <p className="text-2xl font-bold text-emerald">{stats.success}건</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <XCircle className="w-4 h-4 text-destructive" />
              <span className="text-sm text-muted-foreground">실패</span>
            </div>
            <p className="text-2xl font-bold text-destructive">{stats.failed}건</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">성공률</span>
            </div>
            <p className="text-2xl font-bold text-primary">{stats.successRate}%</p>
          </div>
        </div>
      </div>

      {/* Middle grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Account Performance */}
        <div className="glass-panel rounded-xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">계정별 성과</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="pb-3 font-medium">계정명</th>
                  <th className="pb-3 font-medium">티어</th>
                  <th className="pb-3 font-medium">포스팅수</th>
                  <th className="pb-3 font-medium">성공</th>
                  <th className="pb-3 font-medium">실패</th>
                  <th className="pb-3 font-medium">성공률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {accountPerformance.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      계정 성과 데이터가 없습니다
                    </td>
                  </tr>
                ) : (
                  accountPerformance.map((row) => (
                    <tr key={row.accountName} className="text-foreground">
                      <td className="py-3 font-medium">{row.accountName}</td>
                      <td className="py-3 text-muted-foreground">Tier {row.tier}</td>
                      <td className="py-3 text-muted-foreground">{row.totalPosts}</td>
                      <td className="py-3 text-emerald">{row.success}</td>
                      <td className="py-3 text-destructive">{row.failed}</td>
                      <td className={`py-3 font-medium ${rateColor(row.successRate)}`}>
                        {row.successRate}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tier Posting Stats */}
        <div className="glass-panel rounded-xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">티어별 포스팅 현황</h2>
          {tierStats.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">티어별 포스팅 데이터가 없습니다</p>
          ) : (
            <>
              <ul className="space-y-4">
                {tierStats.map((t) => {
                  const total = t.general + t.ad
                  const maxTotal = 54 // max for bar scaling
                  return (
                    <li key={t.tier}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${tierDotColor[t.tier] || 'bg-primary'}`} />
                          <span className="text-sm text-foreground">
                            Tier {t.tier} &mdash; {t.label}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">{total}건</span>
                      </div>
                      <div className="text-xs text-muted-foreground mb-1.5">
                        일반 {t.general}건 / 광고 {t.ad}건
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-muted flex overflow-hidden">
                        <div
                          className={`h-full ${tierBarColor[t.tier] || 'bg-primary'} transition-all duration-500`}
                          style={{ width: `${(t.general / maxTotal) * 100}%` }}
                        />
                        <div
                          className={`h-full ${tierBarColor[t.tier] || 'bg-primary'} opacity-40 transition-all duration-500`}
                          style={{ width: `${(t.ad / maxTotal) * 100}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-2 rounded-sm bg-primary" /> 일반
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-2 rounded-sm bg-primary opacity-40" /> 광고
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom: Posting Detail Records */}
      <div className="glass-panel rounded-xl p-5">
        <h2 className="text-lg font-semibold text-foreground mb-4">포스팅 상세 기록</h2>
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="pb-3 font-medium">날짜</th>
                <th className="pb-3 font-medium">계정</th>
                <th className="pb-3 font-medium">키워드</th>
                <th className="pb-3 font-medium">제목</th>
                <th className="pb-3 font-medium">톤</th>
                <th className="pb-3 font-medium">상태</th>
                <th className="pb-3 font-medium">품질</th>
                <th className="pb-3 font-medium">링크</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {postingRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    포스팅 기록이 없습니다
                  </td>
                </tr>
              ) : (
                postingRecords.map((row, i) => (
                  <tr key={i} className="text-foreground hover:bg-white/[0.03] transition-colors">
                    <td className="py-3 text-muted-foreground whitespace-nowrap">{row.date}</td>
                    <td className="py-3 font-medium whitespace-nowrap">{row.account}</td>
                    <td className="py-3 text-muted-foreground whitespace-nowrap">{row.keyword}</td>
                    <td className="py-3 max-w-[260px] truncate" title={row.title}>{row.title}</td>
                    <td className="py-3 whitespace-nowrap">
                      <StatusBadge label={row.tone} />
                    </td>
                    <td className="py-3 whitespace-nowrap">
                      <StatusBadge label={row.status} />
                    </td>
                    <td className="py-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${gradeStyle[row.quality] || 'bg-muted text-muted-foreground'}`}>
                        {row.quality}
                      </span>
                    </td>
                    <td className="py-3">
                      {row.link ? (
                        <a
                          href={row.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:text-secondary text-xs transition-colors"
                        >
                          보기
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">&mdash;</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
