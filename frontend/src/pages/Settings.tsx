import { useState, useEffect, useCallback } from 'react'
import { Save, Users, Shield, Download, Upload, Heart, Clock, Sliders, Calendar, Info, ArrowUpCircle, Loader2, Terminal, CheckCircle2, XCircle, AlertTriangle, SkipForward, Square, Play, UserPlus, BookOpen, Search } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { useFetch, useMutation } from '../hooks/useApi'
import api from '../lib/api'
import Toggle from '../components/Toggle'
import { PageSkeleton } from '../components/LoadingSkeleton'
import type { SystemSettings, Account, PostingSettings } from '../types'

/* Tier rules — 1계정 1일 1포스팅, N일 주기 중 일반/광고 비율 */
const tierRules = [
  { tier: 1, label: '신규', cycle: '매일', general: 1, ad: 0, desc: '매일 일반글 1건', color: 'bg-muted-foreground' },
  { tier: 2, label: '성장', cycle: '4일', general: 3, ad: 1, desc: '3일 일반 → 1일 광고', color: 'bg-primary' },
  { tier: 3, label: '중급', cycle: '4일', general: 2, ad: 2, desc: '2일 일반 → 2일 광고', color: 'bg-violet-500' },
  { tier: 4, label: '고수익', cycle: '4일', general: 1, ad: 3, desc: '1일 일반 → 3일 광고', color: 'bg-amber' },
  { tier: 5, label: '최상위', cycle: '5일', general: 1, ad: 4, desc: '1일 일반 → 4일 광고', color: 'bg-emerald' },
]

const dayLabels = ['월', '화', '수', '목', '금', '토', '일']

interface PostingScheduleForm extends PostingSettings {
  autoEngine?: boolean
  startHour?: string
  startMin?: string
  endHour?: string
  endMin?: string
  selectedDays?: boolean[]
  intervalMin?: number
  intervalMax?: number
  randomRest?: boolean
  autoTierUpgrade?: boolean
  footerText?: string
  footerLink?: string
  footerText2?: string
  footerLink2?: string
}

const defaultSettings: SystemSettings = {
  claudeApiKey: '', naverClientId: '', naverClientSecret: '',
  engagementBot: true, engStartHour: '09', engStartMin: '00',
  engEndHour: '18', engEndMin: '00',
  maxVisits: 20, heartLike: true,
  engagementAccountIds: [],
  visitInterval: 10, randomDelay: true,
  logLevel: '정보', logRetention: '30일',
  proxyAutoCheck: true, proxyCheckInterval: '6시간',
}

export default function Settings() {
  const { toast } = useToast()

  const { data: serverData, loading: fetchLoading } = useFetch<{ settings: SystemSettings }>(
    '/settings'
  )
  const { data: accountsData } = useFetch<{ accounts: Account[] }>('/accounts')
  const { mutate: saveSettings, loading: saving } = useMutation('/settings', 'put')

  const accountList = (accountsData?.accounts || []).map(a => a.accountName)
  const [form, setForm] = useState<SystemSettings>(defaultSettings)
  const [allAccounts, setAllAccounts] = useState(false)
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, boolean>>({})

  /* ── 자동 포스팅 스케줄 설정 (별도 /posting/settings) ── */
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
  const [distribution, setDistribution] = useState<'sequential' | 'random' | 'tier'>('tier')
  const [autoTierUpgrade, setAutoTierUpgrade] = useState(true)
  const [footerText, setFooterText] = useState('홈페이지에서 등록 하거나')
  const [footerLink, setFooterLink] = useState('http://home.dailyfni.co.kr')
  const [footerText2, setFooterText2] = useState('카카오톡으로 문의주셔도 됩니다.')
  const [footerLink2, setFooterLink2] = useState('http://pf.kakao.com/')
  const [savingPosting, setSavingPosting] = useState(false)

  /* ── 스케줄러 실시간 로그 + 상태 ── */
  type SchedulerLog = { time: string; level: 'info' | 'warn' | 'error' | 'success' | 'skip'; message: string }
  const [schedulerLogs, setSchedulerLogs] = useState<SchedulerLog[]>([])
  const [schedulerRunning, setSchedulerRunning] = useState(false)
  const [togglingScheduler, setTogglingScheduler] = useState(false)

  useEffect(() => {
    let mounted = true
    const fetchLogs = async () => {
      try {
        const [logRes, statusRes] = await Promise.all([
          api.get('/posting/scheduler-logs'),
          api.get('/posting/scheduler-status'),
        ])
        if (mounted) {
          if (logRes.data?.logs) setSchedulerLogs(logRes.data.logs)
          if (statusRes.data) setSchedulerRunning(!!statusRes.data.running)
        }
      } catch {}
    }
    fetchLogs()
    const iv = setInterval(fetchLogs, 3000)
    return () => { mounted = false; clearInterval(iv) }
  }, [])

  const handleStopScheduler = async () => {
    setTogglingScheduler(true)
    try {
      await api.post('/posting/scheduler/stop')
      setSchedulerRunning(false)
      toast('success', '스케줄러가 정지되었습니다. 진행 중인 작업은 완료 후 멈춥니다.')
    } catch { toast('error', '정지 실패') }
    setTogglingScheduler(false)
  }
  const handleStartScheduler = async () => {
    setTogglingScheduler(true)
    try {
      await api.post('/posting/scheduler/start')
      setSchedulerRunning(true)
      toast('success', '스케줄러가 시작되었습니다.')
    } catch { toast('error', '시작 실패') }
    setTogglingScheduler(false)
  }

  /* ── 서로이웃 자동 수락 설정 ── */
  const [buddyEnabled, setBuddyEnabled] = useState(false)
  const [buddyDays, setBuddyDays] = useState([true, false, true, false, true, false, false])
  const [buddyHour, setBuddyHour] = useState('09')
  const [buddyMin, setBuddyMin] = useState('00')
  const [buddyMode, setBuddyMode] = useState<'all' | 'with_message'>('all')
  const [buddyMax, setBuddyMax] = useState(50)
  const [buddyAccountIds, setBuddyAccountIds] = useState<string[]>([])
  const [buddyAllAccounts, setBuddyAllAccounts] = useState(true)
  const [savingBuddy, setSavingBuddy] = useState(false)
  type BuddyLog = { id: number; accountName: string; acceptedCount: number; skippedCount: number; error: string; timestamp: string }
  const [buddyLogs, setBuddyLogs] = useState<BuddyLog[]>([])

  const fetchBuddySettings = useCallback(async () => {
    try {
      const [settingsRes, logsRes] = await Promise.all([
        api.get('/buddy/settings'),
        api.get('/buddy/logs'),
      ])
      const s = settingsRes.data?.settings || {}
      if (s.enabled !== undefined) setBuddyEnabled(s.enabled)
      if (s.selectedDays) setBuddyDays(s.selectedDays)
      if (s.runHour) setBuddyHour(s.runHour)
      if (s.runMin) setBuddyMin(s.runMin)
      if (s.acceptMode) setBuddyMode(s.acceptMode)
      if (s.dailyMaxAccept) setBuddyMax(s.dailyMaxAccept)
      if (s.accountIds && s.accountIds.length > 0) {
        setBuddyAccountIds(s.accountIds)
        setBuddyAllAccounts(false)
      }
      if (logsRes.data?.logs) setBuddyLogs(logsRes.data.logs)
    } catch {}
  }, [])

  useEffect(() => { fetchBuddySettings() }, [fetchBuddySettings])

  const handleSaveBuddy = async () => {
    setSavingBuddy(true)
    try {
      await api.put('/buddy/settings', {
        enabled: buddyEnabled,
        selectedDays: buddyDays,
        runHour: buddyHour,
        runMin: buddyMin,
        acceptMode: buddyMode,
        dailyMaxAccept: buddyMax,
        accountIds: buddyAllAccounts ? [] : buddyAccountIds,
      })
      toast('success', '서로이웃 설정이 저장되었습니다.')
    } catch { toast('error', '저장 실패') }
    setSavingBuddy(false)
  }

  const toggleBuddyDay = (i: number) => setBuddyDays(prev => prev.map((v, idx) => idx === i ? !v : v))

  const toggleBuddyAccount = (id: string) => {
    setBuddyAccountIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  /* ── 블로그 스타일 분석 ── */
  const [styleUrls, setStyleUrls] = useState('')
  const [styleGuide, setStyleGuide] = useState('')
  const [styleLoading, setStyleLoading] = useState(false)
  const [savingStyle, setSavingStyle] = useState(false)
  const [styleUpdatedAt, setStyleUpdatedAt] = useState('')

  useEffect(() => {
    api.get('/style/settings').then(({ data }) => {
      if (data?.guide) setStyleGuide(data.guide)
    }).catch(() => {})
    api.get('/style/guide').then(({ data }: any) => {
      if (data?.updated_at) setStyleUpdatedAt(data.updated_at)
    }).catch(() => {})
  }, [])

  const handleAnalyze = async () => {
    const urls = styleUrls.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'))
    if (urls.length === 0) { toast('error', 'URL을 1개 이상 입력하세요'); return }
    setStyleLoading(true)
    try {
      await api.post('/style/analyze', { urls, maxPosts: urls.length })
      toast('success', `${urls.length}개 URL 분석 시작 — 완료 후 자동 저장됩니다.`)
      // 30초 후 결과 폴링
      setTimeout(async () => {
        try {
          const { data } = await api.get('/style/settings')
          if (data?.guide) { setStyleGuide(data.guide); toast('success', '스타일 가이드 생성 완료!') }
        } catch {}
        setStyleLoading(false)
      }, 30000)
    } catch { toast('error', '분석 시작 실패'); setStyleLoading(false) }
  }

  const handleSaveStyle = async () => {
    setSavingStyle(true)
    try {
      await api.put('/style/settings', { guide: styleGuide })
      toast('success', '스타일 가이드 저장됨 — 다음 글 생성부터 자동 적용됩니다.')
    } catch { toast('error', '저장 실패') }
    setSavingStyle(false)
  }

  const fetchPostingSettings = useCallback(async () => {
    try {
      const { data } = await api.get('/posting/settings')
      const s: PostingScheduleForm = data.settings || {}
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
      if (s.distribution) setDistribution(s.distribution as any)
      if (s.autoTierUpgrade !== undefined) setAutoTierUpgrade(s.autoTierUpgrade)
      if (s.footerLink !== undefined) setFooterLink(s.footerLink)
      if (s.footerText !== undefined) setFooterText(s.footerText)
      if (s.footerLink2 !== undefined) setFooterLink2(s.footerLink2)
      if (s.footerText2 !== undefined) setFooterText2(s.footerText2)
    } catch {}
  }, [])

  useEffect(() => { fetchPostingSettings() }, [fetchPostingSettings])

  const handleSavePosting = async () => {
    setSavingPosting(true)
    try {
      await api.put('/posting/settings', {
        autoEngine, startHour, startMin, endHour, endMin, selectedDays,
        intervalMin, intervalMax, randomRest, dailyMax, distribution, autoTierUpgrade,
        footerLink, footerText, footerLink2, footerText2,
      })
      toast('success', '포스팅 스케줄이 저장되었습니다.')
    } catch { toast('error', '스케줄 저장 실패') }
    setSavingPosting(false)
  }

  const toggleDay = (i: number) => setSelectedDays(prev => prev.map((v, idx) => idx === i ? !v : v))

  useEffect(() => {
    if (serverData?.settings) setForm({ ...defaultSettings, ...serverData.settings })
  }, [serverData])

  useEffect(() => {
    if (accountList.length > 0 && Object.keys(selectedAccounts).length === 0) {
      setSelectedAccounts(Object.fromEntries(accountList.map(a => [a, true])))
      setAllAccounts(true)
    }
  }, [accountList.length])

  const set = <K extends keyof SystemSettings>(key: K, val: SystemSettings[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    const result = await saveSettings(form)
    if (result) toast('success', '설정이 저장되었습니다.')
    else toast('error', '설정 저장에 실패했습니다.')
  }

  const toggleAllAccounts = () => {
    const next = !allAccounts
    setAllAccounts(next)
    setSelectedAccounts(Object.fromEntries(accountList.map((a) => [a, next])))
  }
  const toggleAccount = (name: string) => {
    setSelectedAccounts((prev) => {
      const updated = { ...prev, [name]: !prev[name] }
      setAllAccounts(Object.values(updated).every(Boolean))
      return updated
    })
  }

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
  const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))
  const labelClass = 'block text-sm font-medium text-foreground mb-1.5'
  const selectClass = 'rounded-lg bg-input border border-border px-4 py-2.5 text-foreground focus:border-primary focus:outline-none transition-colors appearance-none'

  if (fetchLoading) return <PageSkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">시스템 설정</h1>
          <p className="text-sm text-muted-foreground">이웃참여, 시스템 환경을 관리합니다. API 키는 .env 파일에서 설정하세요.</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-primary to-secondary text-white font-medium hover:opacity-90 transition-opacity shadow-lg shadow-primary/25 disabled:opacity-50">
          {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
          설정 저장
        </button>
      </div>

      {/* ── 자동 포스팅 스케줄 설정 ── */}
      <div className="glass-panel rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">자동 포스팅 스케줄 설정</h2>
            <span className={`ml-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
              schedulerRunning ? 'bg-emerald/15 text-emerald' : 'bg-muted text-muted-foreground'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${schedulerRunning ? 'bg-emerald animate-pulse' : 'bg-muted-foreground'}`} />
              {schedulerRunning ? '실행 중' : '정지'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {schedulerRunning ? (
              <button onClick={handleStopScheduler} disabled={togglingScheduler}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 text-sm font-medium transition-colors disabled:opacity-50">
                {togglingScheduler ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current" />}
                정지
              </button>
            ) : (
              <button onClick={handleStartScheduler} disabled={togglingScheduler}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald/15 text-emerald border border-emerald/30 hover:bg-emerald/25 text-sm font-medium transition-colors disabled:opacity-50">
                {togglingScheduler ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                시작
              </button>
            )}
            <Toggle enabled={autoEngine} onToggle={() => setAutoEngine(!autoEngine)} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: 시간/요일/간격 */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>시작 시간</label>
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
                <label className={labelClass}>종료 시간</label>
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
              <label className={labelClass}>포스팅 요일</label>
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
              <label className={labelClass}>포스팅 간격</label>
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

            <div>
              <label className={labelClass}>일일 포스팅 계정 수</label>
              <input type="number" value={dailyMax} onChange={e => setDailyMax(Number(e.target.value))} min={1}
                className={`${selectClass} w-full`} />
              <p className="text-xs text-muted-foreground mt-1">하루에 포스팅할 계정 수 (1계정 = 1포스팅)</p>
            </div>

            <div>
              <label className={labelClass}>분배 방식</label>
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

            {/* ── 스케줄러 실시간 로그 ── */}
            <div className="mt-2">
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Terminal className="w-4 h-4 text-primary" /> 스케줄러 실시간 로그
                </label>
                <span className="text-[10px] text-muted-foreground">3초마다 갱신 · 최근 {schedulerLogs.length}건</span>
              </div>
              <div className="rounded-lg border border-border bg-background/60 h-[280px] overflow-y-auto p-2 font-mono text-[11px] space-y-1">
                {schedulerLogs.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                    로그 대기 중... (스케줄러는 60초마다 확인합니다)
                  </div>
                ) : (
                  schedulerLogs.map((l, i) => {
                    const t = new Date(l.time)
                    const hhmmss = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}:${String(t.getSeconds()).padStart(2,'0')}`
                    const levelStyle: Record<typeof l.level, string> = {
                      info: 'text-sky-300',
                      success: 'text-emerald',
                      warn: 'text-amber',
                      error: 'text-rose-400',
                      skip: 'text-muted-foreground',
                    }
                    const LevelIcon = ({ level }: { level: typeof l.level }) => {
                      if (level === 'success') return <CheckCircle2 className="w-3 h-3 inline text-emerald" />
                      if (level === 'error') return <XCircle className="w-3 h-3 inline text-rose-400" />
                      if (level === 'warn') return <AlertTriangle className="w-3 h-3 inline text-amber" />
                      if (level === 'skip') return <SkipForward className="w-3 h-3 inline text-muted-foreground" />
                      return <span className="inline-block w-3 h-3 rounded-full bg-sky-400/40 align-middle" />
                    }
                    return (
                      <div key={i} className="flex items-start gap-2 px-1 py-0.5 hover:bg-white/[0.03] rounded">
                        <span className="text-muted-foreground shrink-0">{hhmmss}</span>
                        <LevelIcon level={l.level} />
                        <span className={`${levelStyle[l.level]} break-all`}>{l.message}</span>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right: 티어별 규칙 + 하단 링크 */}
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

            {/* 하단 링크 설정 */}
            <div className="p-3 rounded-lg border border-border bg-background/40 space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium text-foreground">포스팅 하단 문구 / 링크</div>
                  <span className="inline-block px-2 py-0.5 rounded-full bg-amber/15 text-amber text-[10px] font-medium">광고글 전용</span>
                </div>
                <p className="text-xs text-muted-foreground">광고 포스팅 본문 하단에만 자동 삽입됩니다. 일반글에는 적용되지 않습니다. (최대 2개)</p>
              </div>

              <div className="space-y-2 p-3 rounded-lg bg-background/40 border border-border/50">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold grid place-items-center">1</span>
                  <span className="text-xs font-medium text-foreground">홈페이지 / 메인 링크</span>
                </div>
                <input type="text" value={footerText} onChange={e => setFooterText(e.target.value)}
                  placeholder="예: 홈페이지에서 등록 하거나"
                  className={`${selectClass} w-full text-sm`} />
                <input type="text" value={footerLink} onChange={e => setFooterLink(e.target.value)}
                  placeholder="http://home.dailyfni.co.kr"
                  className={`${selectClass} w-full text-sm`} />
              </div>

              <div className="space-y-2 p-3 rounded-lg bg-background/40 border border-border/50">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber/15 text-amber text-[10px] font-bold grid place-items-center">2</span>
                  <span className="text-xs font-medium text-foreground">카카오채널 / 보조 링크</span>
                </div>
                <input type="text" value={footerText2} onChange={e => setFooterText2(e.target.value)}
                  placeholder="예: 카카오톡으로 문의주셔도 됩니다."
                  className={`${selectClass} w-full text-sm`} />
                <input type="text" value={footerLink2} onChange={e => setFooterLink2(e.target.value)}
                  placeholder="http://pf.kakao.com/..."
                  className={`${selectClass} w-full text-sm`} />
              </div>
            </div>

            <button onClick={handleSavePosting} disabled={savingPosting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-primary to-secondary text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
              {savingPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              스케줄 저장
            </button>
          </div>
        </div>
      </div>

      {/* ── 이웃참여 설정 (전체 너비) ── */}
      <div className="glass-panel rounded-xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-rose-400" />
            <h2 className="text-lg font-semibold text-foreground">이웃참여 설정</h2>
          </div>
          <Toggle enabled={form.engagementBot} onToggle={() => set('engagementBot', !form.engagementBot)} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* 시간 설정 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="w-4 h-4" /> 참여 시간 설정
            </div>

            <div>
              <label className={labelClass}>시작 시간</label>
              <div className="flex items-center gap-2">
                <select value={form.engStartHour} onChange={(e) => set('engStartHour', e.target.value)} className={`${selectClass} w-24`}>
                  {hours.map((h) => <option key={h} value={h}>{h}시</option>)}
                </select>
                <span className="text-muted-foreground">:</span>
                <select value={form.engStartMin} onChange={(e) => set('engStartMin', e.target.value)} className={`${selectClass} w-24`}>
                  {minutes.map((m) => <option key={m} value={m}>{m}분</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>종료 시간</label>
              <div className="flex items-center gap-2">
                <select value={form.engEndHour || '18'} onChange={(e) => set('engEndHour' as any, e.target.value)} className={`${selectClass} w-24`}>
                  {hours.map((h) => <option key={h} value={h}>{h}시</option>)}
                </select>
                <span className="text-muted-foreground">:</span>
                <select value={form.engEndMin || '00'} onChange={(e) => set('engEndMin' as any, e.target.value)} className={`${selectClass} w-24`}>
                  {minutes.map((m) => <option key={m} value={m}>{m}분</option>)}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-foreground">방문 간격</label>
                <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-medium">{form.visitInterval || 10}초</span>
              </div>
              <input type="range" min={5} max={60} value={form.visitInterval || 10}
                onChange={(e) => set('visitInterval' as any, Number(e.target.value))}
                className="w-full h-2 rounded-full bg-muted appearance-none cursor-pointer accent-primary" />
              <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>5초</span><span>60초</span></div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.randomDelay !== false}
                onChange={() => set('randomDelay' as any, !(form.randomDelay !== false))}
                className="w-4 h-4 rounded accent-primary" />
              <div>
                <span className="text-sm text-foreground">랜덤 딜레이</span>
                <p className="text-xs text-muted-foreground">방문 간격에 ±50% 랜덤 적용 (어뷰징 방지)</p>
              </div>
            </label>
          </div>

          {/* 활동 설정 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Sliders className="w-4 h-4" /> 활동 설정
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-foreground">계정당 최대 방문 수</label>
                <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-medium">{form.maxVisits}회</span>
              </div>
              <input type="range" min={1} max={50} value={form.maxVisits}
                onChange={(e) => set('maxVisits', Number(e.target.value))}
                className="w-full h-2 rounded-full bg-muted appearance-none cursor-pointer accent-primary" />
              <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>1</span><span>50</span></div>
            </div>

            <div className="p-4 rounded-lg border border-border bg-background/40 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.heartLike} onChange={() => set('heartLike', !form.heartLike)}
                  className="w-4 h-4 rounded accent-rose-400" />
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-rose-400" />
                  <span className="text-sm text-foreground">하트 공감</span>
                </div>
              </label>

            </div>
          </div>

          {/* 참여 계정 선택 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Users className="w-4 h-4" /> 참여 계정 선택
            </div>

            <div className="space-y-2 rounded-lg border border-border bg-card/50 p-3 max-h-[340px] overflow-y-auto">
              <label className="flex items-center gap-3 cursor-pointer border-b border-border pb-2">
                <input type="checkbox" checked={allAccounts} onChange={toggleAllAccounts} className="w-4 h-4 rounded accent-primary" />
                <span className="text-sm font-medium text-foreground">전체 계정</span>
              </label>
              {accountList.map((account) => (
                <label key={account} className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={selectedAccounts[account] ?? false} onChange={() => toggleAccount(account)}
                    className="w-4 h-4 rounded accent-primary" />
                  <span className="text-sm text-foreground">{account}</span>
                </label>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              선택된 계정: {Object.values(selectedAccounts).filter(Boolean).length} / {accountList.length}개
            </p>
          </div>
        </div>
      </div>

      {/* ── 서로이웃 자동 수락 설정 ── */}
      <div className="glass-panel rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-emerald" />
            <h2 className="text-lg font-semibold text-foreground">서로이웃 자동 수락 설정</h2>
          </div>
          <Toggle enabled={buddyEnabled} onToggle={() => setBuddyEnabled(!buddyEnabled)} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 좌: 스케줄 설정 */}
          <div className="space-y-4">
            <div>
              <label className={labelClass}>실행 요일 (주간 단위)</label>
              <div className="flex gap-2">
                {dayLabels.map((d, i) => (
                  <button key={d} onClick={() => toggleBuddyDay(i)}
                    className={`w-9 h-9 rounded-full text-sm font-medium transition-colors ${
                      buddyDays[i] ? 'bg-emerald text-white' : 'border border-border text-muted-foreground hover:border-emerald'
                    }`}>{d}</button>
                ))}
              </div>
            </div>

            <div>
              <label className={labelClass}>실행 시간</label>
              <div className="flex items-center gap-1">
                <select value={buddyHour} onChange={e => setBuddyHour(e.target.value)} className={`${selectClass} w-20`}>
                  {hours.map(h => <option key={h} value={h}>{h}시</option>)}
                </select>
                <span className="text-muted-foreground">:</span>
                <select value={buddyMin} onChange={e => setBuddyMin(e.target.value)} className={`${selectClass} w-20`}>
                  {minutes.map(m => <option key={m} value={m}>{m}분</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>수락 조건</label>
              <div className="flex flex-wrap gap-2">
                {([['all', '전체 수락'], ['with_message', '메시지 있는 신청만']] as const).map(([v, l]) => (
                  <label key={v} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                    buddyMode === v ? 'border-emerald bg-emerald/10 text-emerald' : 'border-border text-muted-foreground hover:border-emerald/50'
                  }`}>
                    <input type="radio" name="buddyMode" value={v} checked={buddyMode === v} onChange={() => setBuddyMode(v)} className="sr-only" />
                    <span className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${buddyMode === v ? 'border-emerald' : 'border-muted-foreground'}`}>
                      {buddyMode === v && <span className="w-1.5 h-1.5 rounded-full bg-emerald" />}
                    </span>
                    {l}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className={labelClass}>일일 최대 수락</label>
              <input type="number" value={buddyMax} onChange={e => setBuddyMax(Number(e.target.value))} min={1} max={200}
                className={`${selectClass} w-full`} />
              <p className="text-xs text-muted-foreground mt-1">계정당 1회 실행 시 최대 수락 수 (어뷰징 방지: 50건 권장)</p>
            </div>

            <div>
              <label className={labelClass}>참여 계정</label>
              <div className="space-y-2 rounded-lg border border-border bg-card/50 p-3 max-h-[200px] overflow-y-auto">
                <label className="flex items-center gap-3 cursor-pointer border-b border-border pb-2">
                  <input type="checkbox" checked={buddyAllAccounts} onChange={() => {
                    const next = !buddyAllAccounts
                    setBuddyAllAccounts(next)
                    if (next) setBuddyAccountIds([])
                  }} className="w-4 h-4 rounded accent-emerald" />
                  <span className="text-sm font-medium text-foreground">전체 계정</span>
                </label>
                {(accountsData?.accounts || []).map((a: any) => (
                  <label key={a.id} className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox"
                      checked={buddyAllAccounts || buddyAccountIds.includes(a.id)}
                      disabled={buddyAllAccounts}
                      onChange={() => toggleBuddyAccount(a.id)}
                      className="w-4 h-4 rounded accent-emerald" />
                    <span className="text-sm text-foreground">{a.accountName}</span>
                  </label>
                ))}
              </div>
            </div>

            <button onClick={handleSaveBuddy} disabled={savingBuddy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-emerald to-teal-500 text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
              {savingBuddy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              서로이웃 설정 저장
            </button>
          </div>

          {/* 우: 최근 수락 로그 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Terminal className="w-4 h-4" /> 최근 수락 로그
            </div>
            <div className="rounded-lg border border-border bg-background/60 h-[440px] overflow-y-auto p-3 space-y-2">
              {buddyLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                  아직 수락 기록이 없습니다
                </div>
              ) : (
                buddyLogs.map(log => {
                  const t = new Date(log.timestamp)
                  const dateStr = `${String(t.getMonth()+1).padStart(2,'0')}/${String(t.getDate()).padStart(2,'0')} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`
                  const hasError = !!log.error
                  return (
                    <div key={log.id} className={`p-2.5 rounded-lg border text-sm ${hasError ? 'border-rose-500/30 bg-rose-500/5' : 'border-border bg-background/40'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-foreground">{log.accountName}</span>
                        <span className="text-xs text-muted-foreground">{dateStr}</span>
                      </div>
                      {hasError ? (
                        <p className="text-xs text-rose-400">{log.error}</p>
                      ) : (
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-emerald">✓ {log.acceptedCount}건 수락</span>
                          {log.skippedCount > 0 && <span className="text-muted-foreground">({log.skippedCount}건 건너뜀)</span>}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 블로그 스타일 분석 (글 품질 개선) ── */}
      <div className="glass-panel rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-violet-400" />
          <h2 className="text-lg font-semibold text-foreground">블로그 스타일 분석</h2>
          {styleUpdatedAt && (
            <span className="ml-2 text-xs text-muted-foreground">
              최종 분석: {new Date(styleUpdatedAt).toLocaleDateString('ko-KR')}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          인기 블로그 URL을 분석하여 글쓰기 스타일 가이드를 생성합니다. 생성된 가이드는 AI 콘텐츠 생성 시 자동으로 프롬프트에 주입됩니다.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 좌: URL 입력 + 분석 */}
          <div className="space-y-4">
            <div>
              <label className={labelClass}>참고 블로그 URL (줄바꿈으로 구분)</label>
              <textarea
                value={styleUrls}
                onChange={e => setStyleUrls(e.target.value)}
                placeholder={"https://blog.naver.com/example1/123456\nhttps://blog.naver.com/example2/789012\nhttps://blog.naver.com/example3/345678"}
                rows={5}
                className="w-full rounded-lg bg-input border border-border px-4 py-2.5 text-foreground text-sm focus:border-primary focus:outline-none transition-colors resize-none font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">잘 쓴 블로그 포스팅 URL을 3~5개 입력하세요. 톤, 구조, 분량을 자동 분석합니다.</p>
            </div>
            <button onClick={handleAnalyze} disabled={styleLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-violet-500 to-purple-500 text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
              {styleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {styleLoading ? '분석 중... (30초 소요)' : '블로그 분석 시작'}
            </button>
          </div>

          {/* 우: 스타일 가이드 편집 */}
          <div className="space-y-4">
            <div>
              <label className={labelClass}>스타일 가이드 (AI 프롬프트에 자동 주입)</label>
              <textarea
                value={styleGuide}
                onChange={e => setStyleGuide(e.target.value)}
                placeholder="블로그를 분석하면 자동 생성됩니다. 수동으로 편집할 수도 있습니다."
                rows={10}
                className="w-full rounded-lg bg-input border border-border px-4 py-2.5 text-foreground text-xs focus:border-primary focus:outline-none transition-colors resize-none font-mono leading-relaxed"
              />
              <p className="text-xs text-muted-foreground mt-1">이 가이드가 존재하면 AI 글 생성 시 자동으로 프롬프트 끝에 추가됩니다. 비워두면 미적용.</p>
            </div>
            <button onClick={handleSaveStyle} disabled={savingStyle}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-violet-500 to-purple-500 text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
              {savingStyle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              스타일 가이드 저장
            </button>
          </div>
        </div>
      </div>

      {/* ── 시스템 및 보안 ── */}
      <div className="glass-panel rounded-xl p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-amber" />
          <h2 className="text-lg font-semibold text-foreground">시스템 및 보안</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label className={labelClass}>데이터 저장 경로</label>
            <input type="text" value="C:\DailyFNI\data" readOnly
              className="w-full rounded-lg bg-muted border border-border px-4 py-2.5 text-muted-foreground cursor-not-allowed" />
          </div>
          <div>
            <label className={labelClass}>로그 수준</label>
            <select value={form.logLevel} onChange={(e) => set('logLevel', e.target.value)} className={`${selectClass} w-full`}>
              <option>정보</option><option>경고</option><option>오류</option><option>디버그</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>로그 보관 기간</label>
            <select value={form.logRetention} onChange={(e) => set('logRetention', e.target.value)} className={`${selectClass} w-full`}>
              <option>7일</option><option>14일</option><option>30일</option><option>90일</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-foreground text-sm font-medium hover:border-primary hover:text-primary transition-colors">
              <Download className="w-4 h-4" /> 설정 백업
            </button>
            <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-foreground text-sm font-medium hover:border-primary hover:text-primary transition-colors">
              <Upload className="w-4 h-4" /> 설정 복원
            </button>
          </div>

          <div className="flex items-center gap-4 ml-auto">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-foreground">프록시 자동 점검</span>
              <Toggle enabled={form.proxyAutoCheck} onToggle={() => set('proxyAutoCheck', !form.proxyAutoCheck)} size="sm" />
            </div>
            <select value={form.proxyCheckInterval} onChange={(e) => set('proxyCheckInterval', e.target.value)} className={`${selectClass} w-28`}>
              <option>1시간</option><option>6시간</option><option>12시간</option><option>24시간</option>
            </select>
          </div>
        </div>

        <div className="pt-3 border-t border-border flex items-center justify-between">
          <p className="text-xs text-muted-foreground">DailyFNI v1.0.0 | Claude Sonnet 4.5</p>
          <p className="text-xs text-muted-foreground">API 키는 <code className="bg-muted px-1.5 py-0.5 rounded text-xs">.env</code> 파일에서 관리됩니다</p>
        </div>
      </div>
    </div>
  )
}
