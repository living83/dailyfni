import { useState } from 'react'
import {
  Zap,
  Play,
  Trash2,
  CheckCircle2,
  Loader2,
  Clock,
  XCircle,
  AlertTriangle,
  Info,
  Save,
} from 'lucide-react'

/* ── Queue row types ── */
type QueueStatus = '발행완료' | '발행중' | '대기중' | '실패'
type ToneType = '친근톤' | '전문톤' | '리뷰톤'
type Severity = '경고' | '오류' | '정보'

interface QueueRow {
  order: number
  keyword: string
  account: string
  tone: ToneType
  scheduledTime: string
  status: QueueStatus
}

interface ErrorEntry {
  timestamp: string
  account: string
  message: string
  severity: Severity
}

/* ── Mock data ── */
const queueRows: QueueRow[] = [
  { order: 1, keyword: '청년도약계좌', account: '블로그계정1', tone: '친근톤', scheduledTime: '10:30', status: '발행완료' },
  { order: 2, keyword: '신용대출 비교', account: '마케팅02', tone: '전문톤', scheduledTime: '11:00', status: '발행완료' },
  { order: 3, keyword: '전세자금대출', account: '대출전문03', tone: '리뷰톤', scheduledTime: '11:30', status: '발행중' },
  { order: 4, keyword: '개인회생 방법', account: '재테크블로그', tone: '전문톤', scheduledTime: '12:00', status: '대기중' },
  { order: 5, keyword: '파킹통장 추천', account: '금융정보센터', tone: '친근톤', scheduledTime: '즉시', status: '대기중' },
  { order: 6, keyword: '주택담보대출', account: '생활경제팁', tone: '리뷰톤', scheduledTime: '13:00', status: '대기중' },
  { order: 7, keyword: '적금 금리 비교', account: '절약의달인', tone: '전문톤', scheduledTime: '13:30', status: '실패' },
  { order: 8, keyword: 'DSR 계산법', account: '머니투데이K', tone: '친근톤', scheduledTime: '14:00', status: '대기중' },
]

const errorEntries: ErrorEntry[] = [
  { timestamp: '10:45:12', account: '마케팅02', message: '로그인 실패 - 캡챠 감지', severity: '오류' },
  { timestamp: '10:32:08', account: '절약의달인', message: '게시 제한 - 일일 한도 초과', severity: '경고' },
  { timestamp: '10:15:44', account: '생활경제팁', message: '프록시 연결 실패', severity: '오류' },
  { timestamp: '09:58:21', account: '대출전문03', message: '저품질 판정 - 재작성 필요', severity: '정보' },
]

/* ── Helpers ── */
const toneStyle: Record<ToneType, string> = {
  친근톤: 'bg-emerald/15 text-emerald',
  전문톤: 'bg-primary/15 text-primary',
  리뷰톤: 'bg-amber/15 text-amber',
}

function StatusIcon({ status }: { status: QueueStatus }) {
  switch (status) {
    case '발행완료':
      return <CheckCircle2 className="w-4 h-4 text-emerald" />
    case '발행중':
      return <Loader2 className="w-4 h-4 text-amber animate-spin" />
    case '대기중':
      return <Clock className="w-4 h-4 text-muted-foreground" />
    case '실패':
      return <XCircle className="w-4 h-4 text-destructive" />
  }
}

const statusStyle: Record<QueueStatus, string> = {
  발행완료: 'bg-emerald/15 text-emerald',
  발행중: 'bg-amber/15 text-amber',
  대기중: 'bg-muted text-muted-foreground',
  실패: 'bg-destructive/15 text-destructive',
}

const severityStyle: Record<Severity, string> = {
  경고: 'bg-amber/15 text-amber',
  오류: 'bg-destructive/15 text-destructive',
  정보: 'bg-primary/15 text-primary',
}

function SeverityIcon({ severity }: { severity: Severity }) {
  switch (severity) {
    case '경고':
      return <AlertTriangle className="w-3.5 h-3.5 text-amber" />
    case '오류':
      return <XCircle className="w-3.5 h-3.5 text-destructive" />
    case '정보':
      return <Info className="w-3.5 h-3.5 text-primary" />
  }
}

/* ── Component ── */
export default function Posting() {
  const [distribution, setDistribution] = useState<'sequential' | 'random' | 'tier'>('sequential')
  const [interval, setInterval] = useState('10분')
  const [dailyMax, setDailyMax] = useState(10)
  const [accountMax, setAccountMax] = useState(3)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">포스팅 관리</h1>
          <p className="text-sm text-muted-foreground">자동 포스팅 실행 및 예약을 관리합니다</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald text-white text-sm font-medium hover:bg-emerald/90 transition-colors">
          <Zap className="w-4 h-4" />
          즉시 발행
        </button>
      </div>

      {/* Posting Queue */}
      <div className="glass-panel rounded-xl p-5">
        <h2 className="text-lg font-semibold text-foreground mb-4">포스팅 큐</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="pb-3 font-medium">순서</th>
                <th className="pb-3 font-medium">키워드</th>
                <th className="pb-3 font-medium">대상계정</th>
                <th className="pb-3 font-medium">톤</th>
                <th className="pb-3 font-medium">예약시간</th>
                <th className="pb-3 font-medium">상태</th>
                <th className="pb-3 font-medium">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {queueRows.map((row) => (
                <tr
                  key={row.order}
                  className="text-foreground hover:bg-white/[0.03] transition-colors"
                >
                  <td className="py-3 text-muted-foreground">{row.order}</td>
                  <td className="py-3 font-medium">{row.keyword}</td>
                  <td className="py-3 text-muted-foreground">{row.account}</td>
                  <td className="py-3">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${toneStyle[row.tone]}`}>
                      {row.tone}
                    </span>
                  </td>
                  <td className="py-3 text-muted-foreground">{row.scheduledTime}</td>
                  <td className="py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle[row.status]}`}>
                      <StatusIcon status={row.status} />
                      {row.status}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <button
                        className="p-1.5 rounded-md hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors"
                        title="즉시 실행"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1.5 rounded-md hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                        title="삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Distribution Settings */}
        <div className="glass-panel rounded-xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">포스팅 분배 설정</h2>
          <div className="space-y-5">
            {/* Distribution mode */}
            <div>
              <label className="block text-sm text-muted-foreground mb-2">분배 방식</label>
              <div className="flex flex-wrap gap-3">
                {([
                  ['sequential', '순차 분배'],
                  ['random', '랜덤 분배'],
                  ['tier', '티어 기반 분배'],
                ] as const).map(([value, label]) => (
                  <label
                    key={value}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                      distribution === value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="distribution"
                      value={value}
                      checked={distribution === value}
                      onChange={() => setDistribution(value)}
                      className="sr-only"
                    />
                    <span
                      className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                        distribution === value ? 'border-primary' : 'border-muted-foreground'
                      }`}
                    >
                      {distribution === value && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </span>
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Interval */}
            <div>
              <label className="block text-sm text-muted-foreground mb-2">포스팅 간격</label>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {['5분', '10분', '15분', '30분', '1시간'].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            {/* Daily max */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-muted-foreground mb-2">일일 최대 포스팅</label>
                <input
                  type="number"
                  value={dailyMax}
                  onChange={(e) => setDailyMax(Number(e.target.value))}
                  min={1}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-2">계정당 최대</label>
                <input
                  type="number"
                  value={accountMax}
                  onChange={(e) => setAccountMax(Number(e.target.value))}
                  min={1}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>

            {/* Save button */}
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors">
              <Save className="w-4 h-4" />
              설정 저장
            </button>
          </div>
        </div>

        {/* Error Log */}
        <div className="glass-panel rounded-xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">오류 로그</h2>
          <ul className="space-y-3">
            {errorEntries.map((entry, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-lg border border-border p-3"
              >
                <div className="mt-0.5">
                  <SeverityIcon severity={entry.severity} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-muted-foreground">{entry.timestamp}</span>
                    <span className="text-xs font-medium text-foreground">{entry.account}</span>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${severityStyle[entry.severity]}`}>
                      {entry.severity}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">{entry.message}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 text-center">
            <button className="text-sm text-primary hover:text-secondary transition-colors">
              전체 로그 보기 &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
