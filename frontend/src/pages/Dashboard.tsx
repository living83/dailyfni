import { Users, Send, FileText, TrendingUp } from 'lucide-react'

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

/* ── Mock posting data ── */
const postingRows = [
  { time: '10:32', account: '블로그계정1', keyword: '청년도약계좌', tone: '친근톤', toneColor: 'bg-emerald/15 text-emerald', status: '발행완료', statusColor: 'bg-emerald/15 text-emerald' },
  { time: '10:28', account: '마케팅02', keyword: '신용대출 비교', tone: '전문톤', toneColor: 'bg-primary/15 text-primary', status: '발행중', statusColor: 'bg-amber/15 text-amber animate-pulse' },
  { time: '10:15', account: '대출전문03', keyword: '전세자금대출', tone: '리뷰톤', toneColor: 'bg-amber/15 text-amber', status: '생성중', statusColor: 'bg-primary/15 text-primary' },
  { time: '10:05', account: '재테크블로그', keyword: '주택담보대출', tone: '친근톤', toneColor: 'bg-emerald/15 text-emerald', status: '발행완료', statusColor: 'bg-emerald/15 text-emerald' },
  { time: '09:52', account: '금융정보센터', keyword: '적금 추천', tone: '전문톤', toneColor: 'bg-primary/15 text-primary', status: '대기', statusColor: 'bg-muted text-muted-foreground' },
  { time: '09:40', account: '생활경제팁', keyword: '카드 혜택 비교', tone: '리뷰톤', toneColor: 'bg-amber/15 text-amber', status: '실패', statusColor: 'bg-destructive/15 text-destructive' },
]

/* ── Account tier data ── */
const tiers = [
  { tier: 1, label: '신규', count: 3, max: 12, barColor: 'bg-muted-foreground' },
  { tier: 2, label: '성장', count: 4, max: 12, barColor: 'bg-primary' },
  { tier: 3, label: '중급', count: 3, max: 12, barColor: 'bg-violet-500' },
  { tier: 4, label: '고수익', count: 1, max: 12, barColor: 'bg-amber' },
  { tier: 5, label: '최상위', count: 1, max: 12, barColor: 'bg-emerald' },
]

export default function Dashboard() {
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
          value={12}
          subtext="Naver 계정"
          icon={<Users className="w-5 h-5 text-primary" />}
        />
        <StatCard
          title="오늘 포스팅"
          value={24}
          subtext="성공 22 / 실패 2"
          icon={<Send className="w-5 h-5 text-emerald" />}
        />
        <StatCard
          title="대기중 콘텐츠"
          value={8}
          subtext="예약 발행 대기"
          icon={<FileText className="w-5 h-5 text-amber" />}
        />
        <StatCard
          title="성공률"
          value="96.5%"
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
                {postingRows.map((row, i) => (
                  <tr key={i} className="text-foreground">
                    <td className="py-3 text-muted-foreground">{row.time}</td>
                    <td className="py-3 font-medium">{row.account}</td>
                    <td className="py-3 text-muted-foreground">{row.keyword}</td>
                    <td className="py-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${row.toneColor}`}>
                        {row.tone}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${row.statusColor}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Account Tier Distribution */}
        <div className="glass-panel rounded-xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">계정 티어 분포</h2>
          <ul className="space-y-4">
            {tiers.map((t) => (
              <li key={t.tier}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-foreground">
                    Tier {t.tier} &mdash; {t.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{t.count}개</span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${t.barColor} transition-all duration-500`}
                    style={{ width: `${(t.count / t.max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
