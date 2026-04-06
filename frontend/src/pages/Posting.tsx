import { useState, useEffect, useCallback } from 'react'
import {
  Zap, Play, Trash2, CheckCircle2, Loader2, Clock, XCircle,
  AlertTriangle, Info, Save, Send, Calendar, Shield, ArrowUpCircle,
} from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import api from '../lib/api'
import Toggle from '../components/Toggle'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import { PageSkeleton } from '../components/LoadingSkeleton'
import type { PostingQueueItem, PostingSettings, ErrorLogEntry, PostingStatus } from '../types'

type Severity = '경고' | '오류' | '정보'

function StatusIcon({ status }: { status: PostingStatus }) {
  switch (status) {
    case '발행완료': return <CheckCircle2 className="w-4 h-4 text-emerald" />
    case '발행중': return <Loader2 className="w-4 h-4 text-amber animate-spin" />
    case '대기중': return <Clock className="w-4 h-4 text-muted-foreground" />
    case '실패': return <XCircle className="w-4 h-4 text-destructive" />
  }
}

const statusStyle: Record<PostingStatus, string> = {
  발행완료: 'bg-emerald/15 text-emerald', 발행중: 'bg-amber/15 text-amber',
  대기중: 'bg-muted text-muted-foreground', 실패: 'bg-destructive/15 text-destructive',
}
const severityStyle: Record<Severity, string> = {
  경고: 'bg-amber/15 text-amber', 오류: 'bg-destructive/15 text-destructive', 정보: 'bg-primary/15 text-primary',
}
function SeverityIcon({ severity }: { severity: Severity }) {
  switch (severity) {
    case '경고': return <AlertTriangle className="w-3.5 h-3.5 text-amber" />
    case '오류': return <XCircle className="w-3.5 h-3.5 text-destructive" />
    case '정보': return <Info className="w-3.5 h-3.5 text-primary" />
  }
}

/* Tier rules from PRD — 1계정 1일 1포스팅, N일 주기 중 일반/광고 비율 */
const tierRules = [
  { tier: 1, label: '신규', cycle: '매일', general: 1, ad: 0, desc: '매일 일반글 1건', color: 'bg-muted-foreground' },
  { tier: 2, label: '성장', cycle: '4일', general: 3, ad: 1, desc: '3일 일반 → 1일 광고', color: 'bg-primary' },
  { tier: 3, label: '중급', cycle: '4일', general: 2, ad: 2, desc: '2일 일반 → 2일 광고', color: 'bg-violet-500' },
  { tier: 4, label: '고수익', cycle: '4일', general: 1, ad: 3, desc: '1일 일반 → 3일 광고', color: 'bg-amber' },
  { tier: 5, label: '최상위', cycle: '5일', general: 1, ad: 4, desc: '1일 일반 → 4일 광고', color: 'bg-emerald' },
]

const dayLabels = ['월', '화', '수', '목', '금', '토', '일']

export default function Posting() {
  const { toast } = useToast()

  const [queue, setQueue] = useState<PostingQueueItem[]>([])
  const [errors, setErrors] = useState<ErrorLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [runningAll, setRunningAll] = useState(false)
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())
  const [savingSettings, setSavingSettings] = useState(false)

  // Schedule settings
  const [autoEngine, setAutoEngine] = useState(false)
  const [startHour, setStartHour] = useState('09')
  const [startMin, setStartMin] = useState('00')
  const [endHour, setEndHour] = useState('18')
  const [endMin, setEndMin] = useState('00')
  const [selectedDays, setSelectedDays] = useState([true, true, true, true, true, false, false])
  const [intervalMin, setIntervalMin] = useState(30)
  const [intervalMax, setIntervalMax] = useState(90)
  const [randomRest, setRandomRest] = useState(true)
  const [dailyMax, setDailyMax] = useState(10)
  const [accountMax, setAccountMax] = useState(3)
  const [distribution, setDistribution] = useState<PostingSettings['distribution']>('tier')
  const [autoTierUpgrade, setAutoTierUpgrade] = useState(true)

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
  const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

  const fetchQueue = useCallback(async () => {
    try { const { data } = await api.get('/posting/queue'); setQueue(data.queue || []) } catch {}
    setLoading(false)
  }, [])
  const fetchErrors = useCallback(async () => {
    try { const { data } = await api.get('/posting/errors'); setErrors(data.errors || []) } catch {}
  }, [])
  const fetchSettings = useCallback(async () => {
    try {
      const { data } = await api.get('/posting/settings')
      const s = data.settings
      if (s.autoEngine !== undefined) setAutoEngine(s.autoEngine)
      if (s.startHour) setStartHour(s.startHour)
      if (s.startMin) setStartMin(s.startMin)
      if (s.endHour) setEndHour(s.endHour)
      if (s.endMin) setEndMin(s.endMin)
      if (s.selectedDays) setSelectedDays(s.selectedDays)
      if (s.intervalMin) setIntervalMin(s.intervalMin)
      if (s.intervalMax) setIntervalMax(s.intervalMax)
      if (s.randomRest !== undefined) setRandomRest(s.randomRest)
      if (s.dailyMax) setDailyMax(s.dailyMax)
      if (s.accountMax) setAccountMax(s.accountMax)
      if (s.distribution) setDistribution(s.distribution)
      if (s.autoTierUpgrade !== undefined) setAutoTierUpgrade(s.autoTierUpgrade)
    } catch {}
  }, [])

  useEffect(() => { fetchQueue(); fetchErrors(); fetchSettings() }, [fetchQueue, fetchErrors, fetchSettings])

  const handleRunAll = async () => {
    setRunningAll(true)
    try {
      const { data } = await api.post('/posting/run-all')
      toast('success', data.message || '발행이 시작되었습니다.')
      let polls = 0
      const pid = window.setInterval(() => { fetchQueue(); fetchErrors(); polls++; if (polls >= 12) clearInterval(pid) }, 5000)
    } catch { toast('error', '발행 실행에 실패했습니다.') }
    setRunningAll(false)
  }

  const handleRunOne = async (id: string) => {
    setRunningIds(prev => new Set(prev).add(id))
    try {
      const { data } = await api.post(`/posting/queue/${id}/run`)
      toast('success', data.message || '발행이 시작되었습니다.')
      let polls = 0
      const pid = window.setInterval(() => {
        fetchQueue(); fetchErrors(); polls++
        if (polls >= 12) { clearInterval(pid); setRunningIds(prev => { const n = new Set(prev); n.delete(id); return n }) }
      }, 5000)
    } catch {
      toast('error', '발행 실행에 실패했습니다.')
      setRunningIds(prev => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  const handleDelete = async (id: string) => {
    try { await api.delete(`/posting/queue/${id}`); setQueue(prev => prev.filter(r => r.id !== id)); toast('success', '삭제됨') } catch { toast('error', '삭제 실패') }
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      await api.put('/posting/settings', {
        autoEngine, startHour, startMin, endHour, endMin, selectedDays,
        intervalMin, intervalMax, randomRest, dailyMax, accountMax, distribution, autoTierUpgrade,
      })
      toast('success', '포스팅 스케줄이 저장되었습니다.')
    } catch { toast('error', '설정 저장에 실패했습니다.') }
    setSavingSettings(false)
  }

  const toggleDay = (i: number) => setSelectedDays(prev => prev.map((v, idx) => idx === i ? !v : v))

  if (loading) return <PageSkeleton />

  const selectClass = 'rounded-lg bg-input border border-border px-4 py-2.5 text-foreground focus:border-primary focus:outline-none transition-colors appearance-none'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">포스팅 관리</h1>
          <p className="text-sm text-muted-foreground">자동 포스팅 스케줄 및 수동 발행을 관리합니다</p>
        </div>
        <button onClick={handleRunAll} disabled={runningAll}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald text-white text-sm font-medium hover:bg-emerald/90 transition-colors disabled:opacity-50">
          {runningAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          즉시 발행
        </button>
      </div>

      {/* ═══ 자동 포스팅 스케줄 ═══ */}
      <div className="glass-panel rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">자동 포스팅 스케줄</h2>
          </div>
          <Toggle enabled={autoEngine} onToggle={() => setAutoEngine(!autoEngine)} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: 시간/요일/간격 */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">시작 시간</label>
                <div className="flex items-center gap-1">
                  <select value={startHour} onChange={e => setStartHour(e.target.value)} className={`${selectClass} w-20`}>
                    {hours.map(h => <option key={h} value={h}>{h}시</option>)}
                  </select>
                  <span className="text-muted-foreground">:</span>
                  <select value={startMin} onChange={e => setStartMin(e.target.value)} className={`${selectClass} w-20`}>
                    {minutes.map(m => <option key={m} value={m}>{m}분</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">종료 시간</label>
                <div className="flex items-center gap-1">
                  <select value={endHour} onChange={e => setEndHour(e.target.value)} className={`${selectClass} w-20`}>
                    {hours.map(h => <option key={h} value={h}>{h}시</option>)}
                  </select>
                  <span className="text-muted-foreground">:</span>
                  <select value={endMin} onChange={e => setEndMin(e.target.value)} className={`${selectClass} w-20`}>
                    {minutes.map(m => <option key={m} value={m}>{m}분</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">포스팅 요일</label>
              <div className="flex gap-2">
                {dayLabels.map((d, i) => (
                  <button key={d} onClick={() => toggleDay(i)}
                    className={`w-9 h-9 rounded-full text-sm font-medium transition-colors ${
                      selectedDays[i] ? 'bg-primary text-white' : 'border border-border text-muted-foreground hover:border-primary'
                    }`}>{d}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">포스팅 간격</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">최소</span>
                <input type="number" value={intervalMin} onChange={e => setIntervalMin(Number(e.target.value))}
                  className={`${selectClass} w-20 text-center`} />
                <span className="text-xs text-muted-foreground">분 ~ 최대</span>
                <input type="number" value={intervalMax} onChange={e => setIntervalMax(Number(e.target.value))}
                  className={`${selectClass} w-20 text-center`} />
                <span className="text-xs text-muted-foreground">분</span>
              </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={randomRest} onChange={() => setRandomRest(!randomRest)}
                className="w-4 h-4 rounded accent-primary" />
              <div>
                <span className="text-sm text-foreground">랜덤 휴식</span>
                <p className="text-xs text-muted-foreground">10% 확률로 하루 쉬기 (어뷰징 방지)</p>
              </div>
            </label>

            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">일일 포스팅 계정 수</label>
              <input type="number" value={dailyMax} onChange={e => setDailyMax(Number(e.target.value))} min={1}
                className={`${selectClass} w-full`} />
              <p className="text-xs text-muted-foreground mt-1">하루에 포스팅할 계정 수 (1계정 = 1포스팅)</p>
            </div>

            <div>
              <label className="block text-sm text-muted-foreground mb-2">분배 방식</label>
              <div className="flex flex-wrap gap-2">
                {([['sequential', '순차'], ['random', '랜덤'], ['tier', '티어 기반']] as const).map(([v, l]) => (
                  <label key={v} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                    distribution === v ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}>
                    <input type="radio" name="dist" value={v} checked={distribution === v} onChange={() => setDistribution(v)} className="sr-only" />
                    <span className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${distribution === v ? 'border-primary' : 'border-muted-foreground'}`}>
                      {distribution === v && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    </span>
                    {l}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Right: 티어별 규칙 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Shield className="w-4 h-4" /> 티어별 포스팅 규칙
            </div>

            <div className="space-y-3">
              {tierRules.map(t => {
                const total = t.general + t.ad
                return (
                  <div key={t.tier} className="p-3 rounded-lg border border-border bg-background/40">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${t.color}`} />
                        <span className="text-sm font-medium text-foreground">Tier {t.tier} — {t.label}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{t.cycle} 주기</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{t.desc}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden flex">
                        {t.general > 0 && (
                          <div className="h-full bg-primary/60 rounded-l-full" style={{ width: `${(t.general / total) * 100}%` }} />
                        )}
                        {t.ad > 0 && (
                          <div className="h-full bg-amber/60 rounded-r-full" style={{ width: `${(t.ad / total) * 100}%` }} />
                        )}
                      </div>
                      <div className="flex gap-3 text-[10px] shrink-0">
                        <span className="text-primary">일반 {t.general}일</span>
                        <span className="text-amber">광고 {t.ad}일</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center gap-3 p-2 rounded-lg bg-primary/5 border border-primary/10">
              <Info className="w-4 h-4 text-primary shrink-0" />
              <p className="text-xs text-muted-foreground">1계정 1일 1포스팅 원칙. 티어 비율에 따라 오늘 일반/광고를 자동 결정합니다.</p>
            </div>

            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-border bg-background/40">
              <input type="checkbox" checked={autoTierUpgrade} onChange={() => setAutoTierUpgrade(!autoTierUpgrade)}
                className="w-4 h-4 rounded accent-primary" />
              <div>
                <div className="flex items-center gap-2">
                  <ArrowUpCircle className="w-4 h-4 text-emerald" />
                  <span className="text-sm font-medium text-foreground">2주마다 자동 티어 업그레이드</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">티어가 올라가면 광고 포스팅 비중이 자동으로 증가합니다</p>
              </div>
            </label>

            <button onClick={handleSaveSettings} disabled={savingSettings}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-primary to-secondary text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
              {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              스케줄 저장
            </button>
          </div>
        </div>
      </div>

      {/* ═══ 수동 포스팅 큐 ═══ */}
      <div className="glass-panel rounded-xl p-5">
        <h2 className="text-lg font-semibold text-foreground mb-4">수동 포스팅 큐</h2>
        {queue.length === 0 ? (
          <EmptyState icon={<Send className="w-12 h-12" />} title="포스팅 큐가 비어 있습니다" description="콘텐츠를 생성하고 포스팅 큐에 추가해 보세요." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="pb-3 font-medium">#</th>
                  <th className="pb-3 font-medium">키워드</th>
                  <th className="pb-3 font-medium">대상계정</th>
                  <th className="pb-3 font-medium">톤</th>
                  <th className="pb-3 font-medium">상태</th>
                  <th className="pb-3 font-medium">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {queue.map((row, idx) => (
                  <tr key={row.id} className="text-foreground hover:bg-white/[0.03] transition-colors">
                    <td className="py-3 text-muted-foreground">{idx + 1}</td>
                    <td className="py-3 font-medium">{row.keyword}</td>
                    <td className="py-3 text-muted-foreground">{row.accountName}</td>
                    <td className="py-3"><StatusBadge label={row.tone} /></td>
                    <td className="py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle[row.status]}`}>
                        <StatusIcon status={row.status} />{row.status}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleRunOne(row.id)}
                          disabled={runningIds.has(row.id) || row.status === '발행중' || row.status === '발행완료'}
                          className="p-1.5 rounded-md hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors disabled:opacity-30" title="즉시 실행">
                          {runningIds.has(row.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button onClick={() => handleDelete(row.id)}
                          className="p-1.5 rounded-md hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors" title="삭제">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ 오류 로그 ═══ */}
      <div className="glass-panel rounded-xl p-5">
        <h2 className="text-lg font-semibold text-foreground mb-4">오류 로그</h2>
        {errors.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="w-10 h-10" />} title="오류가 없습니다" />
        ) : (
          <ul className="space-y-3">
            {errors.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                <div className="mt-0.5"><SeverityIcon severity={entry.severity} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-muted-foreground">{entry.timestamp}</span>
                    <span className="text-xs font-medium text-foreground">{entry.accountName}</span>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${severityStyle[entry.severity]}`}>{entry.severity}</span>
                  </div>
                  <p className="text-sm text-foreground">{entry.message}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
