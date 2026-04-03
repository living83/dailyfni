import {
  RefreshCw,
  Calendar,
  FileText,
  CheckCircle2,
  XCircle,
  TrendingUp,
  ExternalLink,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
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

/* ── Demo data (fallback when API unavailable) ── */
const demoMonitoring: MonitoringStats = {
  total: 156,
  success: 149,
  failed: 7,
  successRate: 95.5,
}

const demoAccountPerformance: AccountPerformance[] = [
  { accountName: '블로그계정1', tier: 3, totalPosts: 32, success: 32, failed: 0, successRate: 100 },
  { accountName: '마케팅02', tier: 4, totalPosts: 28, success: 27, failed: 1, successRate: 96.4 },
  { accountName: '대출전문03', tier: 5, totalPosts: 30, success: 29, failed: 1, successRate: 96.7 },
  { accountName: '재테크블로그', tier: 2, totalPosts: 25, success: 24, failed: 1, successRate: 96.0 },
  { accountName: '금융정보센터', tier: 3, totalPosts: 22, success: 20, failed: 2, successRate: 90.9 },
  { accountName: '생활경제팁', tier: 1, totalPosts: 19, success: 17, failed: 2, successRate: 89.5 },
].sort((a, b) => b.successRate - a.successRate)

const demoTierStats: TierPosting[] = [
  { tier: 1, label: '신규', general: 15, ad: 0 },
  { tier: 2, label: '성장', general: 30, ad: 10 },
  { tier: 3, label: '중급', general: 20, ad: 20 },
  { tier: 4, label: '고수익', general: 8, ad: 24 },
  { tier: 5, label: '최상위', general: 5, ad: 24 },
]

const demoPostingRecords: PostingRecord[] = [
  { date: '04-02 10:32', account: '블로그계정1', keyword: '청년도약계좌', title: '청년도약계좌 가입조건 총정리 (2026년 최신)', tone: '친근톤', status: '발행완료', quality: 'A', link: 'https://blog.naver.com/example1' },
  { date: '04-02 10:28', account: '마케팅02', keyword: '신용대출 비교', title: '신용대출 금리 비교, 은행별 최저금리 TOP5', tone: '전문톤', status: '발행완료', quality: 'A', link: 'https://blog.naver.com/example2' },
  { date: '04-02 10:15', account: '대출전문03', keyword: '전세자금대출', title: '전세자금대출 조건부터 신청방법까지 한눈에', tone: '리뷰톤', status: '발행완료', quality: 'B', link: 'https://blog.naver.com/example3' },
  { date: '04-02 10:05', account: '재테크블로그', keyword: '개인회생 방법', title: '개인회생 신청 절차와 비용, 실제 후기 공유', tone: '전문톤', status: '발행완료', quality: 'A', link: 'https://blog.naver.com/example4' },
  { date: '04-01 16:20', account: '금융정보센터', keyword: '파킹통장 추천', title: '파킹통장 금리 비교 2026, 어디가 제일 높을까?', tone: '친근톤', status: '저품질', quality: 'C', link: 'https://blog.naver.com/example5' },
  { date: '04-01 15:45', account: '생활경제팁', keyword: '주택담보대출', title: '주택담보대출 LTV DSR 한도 계산기 완벽 가이드', tone: '리뷰톤', status: '발행완료', quality: 'B', link: 'https://blog.naver.com/example6' },
  { date: '04-01 14:30', account: '절약의달인', keyword: '적금 금리 비교', title: '2026 적금 금리 비교, 연 5% 넘는 상품은?', tone: '전문톤', status: '실패', quality: 'D', link: null },
  { date: '04-01 13:10', account: '머니투데이K', keyword: 'DSR 계산법', title: 'DSR 계산법 쉽게 이해하기, 대출 한도 늘리는 팁', tone: '친근톤', status: '발행완료', quality: 'A', link: 'https://blog.naver.com/example8' },
  { date: '04-01 11:50', account: '블로그계정1', keyword: '카드 혜택 비교', title: '신용카드 혜택 비교, 2026 상반기 추천 카드 BEST', tone: '리뷰톤', status: '발행완료', quality: 'B', link: 'https://blog.naver.com/example9' },
  { date: '04-01 10:25', account: '마케팅02', keyword: '비상금 대출', title: '비상금 대출 앱 3곳 비교, 금리·한도·속도 총정리', tone: '전문톤', status: '발행완료', quality: 'A', link: 'https://blog.naver.com/example10' },
]

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

/* ── Component ── */
export default function Monitoring() {
  const { isDemo } = useAuth()
  const { addToast } = useToast()

  const { data: monitoringData, loading: monLoading, refetch: refetchMon } = useFetch<MonitoringStats>(
    isDemo ? null : '/stats/monitoring'
  )
  const { data: accountData, loading: accLoading, refetch: refetchAcc } = useFetch<AccountPerformance[]>(
    isDemo ? null : '/stats/account-performance'
  )
  const { data: tierData, loading: tierLoading, refetch: refetchTier } = useFetch<TierPosting[]>(
    isDemo ? null : '/stats/tier-posting'
  )
  const { data: recordsData, loading: recLoading, refetch: refetchRec } = useFetch<PostingRecordsResponse>(
    isDemo ? null : '/stats/posting-records'
  )

  const stats = monitoringData || demoMonitoring
  const accountPerformance = accountData || demoAccountPerformance
  const tierStats = tierData || demoTierStats
  const postingRecords = recordsData?.records || demoPostingRecords

  const isLoading = !isDemo && (monLoading || accLoading || tierLoading || recLoading)

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
                {accountPerformance.map((row) => (
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
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tier Posting Stats */}
        <div className="glass-panel rounded-xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">티어별 포스팅 현황</h2>
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
              {postingRecords.map((row, i) => (
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
