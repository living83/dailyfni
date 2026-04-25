import { useState, useEffect, useCallback } from 'react'
import { BookOpen, Plus, Trash2, Edit3, Send, Loader2, Save, ExternalLink, Calendar, Square, Play, Terminal, CheckCircle2, XCircle, AlertTriangle, SkipForward } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import api from '../lib/api'
import Toggle from '../components/Toggle'
import { PageSkeleton } from '../components/LoadingSkeleton'

interface TistoryAccount {
  id: string
  accountName: string
  blogName: string
  kakaoId: string
  tier: number
  isActive: boolean
  autoPublish: boolean
  createdAt: string
}

interface TistoryPosting {
  id: string
  keyword: string
  accountName: string
  status: string
  url: string
  error: string
  createdAt: string
}

const statusStyle: Record<string, string> = {
  '발행완료': 'bg-emerald/15 text-emerald',
  '실패': 'bg-rose-500/15 text-rose-400',
  '대기중': 'bg-muted text-muted-foreground',
  '발행중': 'bg-primary/15 text-primary',
}

export default function Tistory() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<TistoryAccount[]>([])
  const [postings, setPostings] = useState<TistoryPosting[]>([])

  // 계정 추가 폼
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ accountName: '', blogName: '', kakaoId: '', kakaoPassword: '' })
  const [saving, setSaving] = useState(false)

  // 편집
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ accountName: '', blogName: '', kakaoId: '', kakaoPassword: '' })

  // 스케줄 설정
  const [autoEngine, setAutoEngine] = useState(false)
  const [startHour, setStartHour] = useState('09')
  const [startMin, setStartMin] = useState('00')
  const [endHour, setEndHour] = useState('18')
  const [endMin, setEndMin] = useState('00')
  const [selectedDays, setSelectedDays] = useState([true, true, true, true, true, false, false])
  const [intervalMin, setIntervalMin] = useState(5)
  const [intervalMax, setIntervalMax] = useState(15)
  const [dailyMax, setDailyMax] = useState(5)
  const [savingSettings, setSavingSettings] = useState(false)
  const [schedulerRunning, setSchedulerRunning] = useState(false)
  const [togglingScheduler, setTogglingScheduler] = useState(false)
  type SchedulerLog = { time: string; level: string; message: string }
  const [schedulerLogs, setSchedulerLogs] = useState<SchedulerLog[]>([])

  const dayLabels = ['월', '화', '수', '목', '금', '토', '일']
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
  const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

  const fetchData = useCallback(async () => {
    try {
      const [accRes, postRes, settRes, statusRes, logRes] = await Promise.all([
        api.get('/tistory/accounts'),
        api.get('/tistory/postings'),
        api.get('/tistory/settings'),
        api.get('/tistory/scheduler/status'),
        api.get('/tistory/scheduler/logs'),
      ])
      if (accRes.data?.accounts) setAccounts(accRes.data.accounts)
      if (postRes.data?.postings) setPostings(postRes.data.postings)
      if (settRes.data?.settings) {
        const s = settRes.data.settings
        if (s.autoEngine !== undefined) setAutoEngine(s.autoEngine)
        if (s.startHour) setStartHour(s.startHour)
        if (s.startMin) setStartMin(s.startMin)
        if (s.endHour) setEndHour(s.endHour)
        if (s.endMin) setEndMin(s.endMin)
        if (s.selectedDays) setSelectedDays(s.selectedDays)
        if (s.intervalMin) setIntervalMin(s.intervalMin)
        if (s.intervalMax) setIntervalMax(s.intervalMax)
        if (s.dailyMax) setDailyMax(s.dailyMax)
      }
      if (statusRes.data) setSchedulerRunning(!!statusRes.data.running)
      if (logRes.data?.logs) setSchedulerLogs(logRes.data.logs)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // 로그 폴링
  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const [logRes, statusRes] = await Promise.all([
          api.get('/tistory/scheduler/logs'),
          api.get('/tistory/scheduler/status'),
        ])
        if (logRes.data?.logs) setSchedulerLogs(logRes.data.logs)
        if (statusRes.data) setSchedulerRunning(!!statusRes.data.running)
      } catch {}
    }, 5000)
    return () => clearInterval(iv)
  }, [])

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      await api.put('/tistory/settings', {
        autoEngine, startHour, startMin, endHour, endMin, selectedDays,
        intervalMin, intervalMax, dailyMax,
      })
      toast('success', '티스토리 스케줄 설정 저장됨')
    } catch { toast('error', '저장 실패') }
    setSavingSettings(false)
  }

  const handleStopScheduler = async () => {
    setTogglingScheduler(true)
    try { await api.post('/tistory/scheduler/stop'); setSchedulerRunning(false); toast('success', '스케줄러 정지') } catch {}
    setTogglingScheduler(false)
  }
  const handleStartScheduler = async () => {
    setTogglingScheduler(true)
    try { await api.post('/tistory/scheduler/start'); setSchedulerRunning(true); toast('success', '스케줄러 시작') } catch {}
    setTogglingScheduler(false)
  }

  const handleAdd = async () => {
    if (!form.accountName || !form.blogName || !form.kakaoId) {
      return toast('error', '계정명, 블로그명, 카카오 ID는 필수입니다.')
    }
    setSaving(true)
    try {
      await api.post('/tistory/accounts', form)
      toast('success', '티스토리 계정이 추가되었습니다.')
      setForm({ accountName: '', blogName: '', kakaoId: '', kakaoPassword: '' })
      setShowForm(false)
      fetchData()
    } catch { toast('error', '추가 실패') }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/tistory/accounts/${id}`)
      toast('success', '삭제되었습니다.')
      fetchData()
    } catch { toast('error', '삭제 실패') }
  }

  const handleUpdate = async () => {
    if (!editId) return
    setSaving(true)
    try {
      await api.put(`/tistory/accounts/${editId}`, editForm)
      toast('success', '수정되었습니다.')
      setEditId(null)
      fetchData()
    } catch { toast('error', '수정 실패') }
    setSaving(false)
  }

  const handleToggle = async (id: string, field: 'isActive' | 'autoPublish', current: boolean) => {
    try {
      await api.put(`/tistory/accounts/${id}`, { [field]: !current })
      fetchData()
    } catch { toast('error', '변경 실패') }
  }

  if (loading) return <PageSkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">티스토리 관리</h1>
          <p className="text-sm text-muted-foreground">티스토리 블로그 계정 관리 및 포스팅</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium hover:opacity-90 transition-opacity shadow-lg">
          <Plus className="w-4 h-4" />
          계정 추가
        </button>
      </div>

      {/* 계정 추가 폼 */}
      {showForm && (
        <div className="glass-panel rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">새 티스토리 계정</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input type="text" placeholder="계정명 (표시용)" value={form.accountName}
              onChange={e => setForm(p => ({ ...p, accountName: e.target.value }))}
              className="rounded-lg bg-input border border-border px-4 py-2.5 text-foreground text-sm focus:border-primary focus:outline-none" />
            <input type="text" placeholder="블로그명 (xxx.tistory.com의 xxx)" value={form.blogName}
              onChange={e => setForm(p => ({ ...p, blogName: e.target.value }))}
              className="rounded-lg bg-input border border-border px-4 py-2.5 text-foreground text-sm focus:border-primary focus:outline-none" />
            <input type="text" placeholder="카카오 이메일" value={form.kakaoId}
              onChange={e => setForm(p => ({ ...p, kakaoId: e.target.value }))}
              className="rounded-lg bg-input border border-border px-4 py-2.5 text-foreground text-sm focus:border-primary focus:outline-none" />
            <input type="password" placeholder="카카오 비밀번호" value={form.kakaoPassword}
              onChange={e => setForm(p => ({ ...p, kakaoPassword: e.target.value }))}
              className="rounded-lg bg-input border border-border px-4 py-2.5 text-foreground text-sm focus:border-primary focus:outline-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm hover:opacity-90 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              저장
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-border text-muted-foreground text-sm hover:text-foreground">
              취소
            </button>
          </div>
        </div>
      )}

      {/* 계정 목록 + 발행 기록 2:1 분할 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 계정 목록 (2/3) */}
        <div className="glass-panel rounded-xl p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold text-foreground mb-4">티스토리 계정</h2>
          {accounts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>등록된 티스토리 계정이 없습니다.</p>
              <p className="text-xs mt-1">"계정 추가" 버튼으로 시작하세요.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map(acc => (
                <div key={acc.id} className="p-4 rounded-lg border border-border bg-background/40 hover:bg-white/[0.03] transition-colors">
                  {editId === acc.id ? (
                    /* 편집 모드 */
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <input type="text" value={editForm.accountName} onChange={e => setEditForm(p => ({ ...p, accountName: e.target.value }))}
                          placeholder="계정명" className="rounded-lg bg-input border border-border px-3 py-2 text-foreground text-sm focus:border-primary focus:outline-none" />
                        <input type="text" value={editForm.blogName} onChange={e => setEditForm(p => ({ ...p, blogName: e.target.value }))}
                          placeholder="블로그명" className="rounded-lg bg-input border border-border px-3 py-2 text-foreground text-sm focus:border-primary focus:outline-none" />
                        <input type="text" value={editForm.kakaoId} onChange={e => setEditForm(p => ({ ...p, kakaoId: e.target.value }))}
                          placeholder="카카오 ID" className="rounded-lg bg-input border border-border px-3 py-2 text-foreground text-sm focus:border-primary focus:outline-none" />
                        <input type="password" value={editForm.kakaoPassword} onChange={e => setEditForm(p => ({ ...p, kakaoPassword: e.target.value }))}
                          placeholder="비밀번호 (변경 시만)" className="rounded-lg bg-input border border-border px-3 py-2 text-foreground text-sm focus:border-primary focus:outline-none" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleUpdate} disabled={saving} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs">저장</button>
                        <button onClick={() => setEditId(null)} className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-xs">취소</button>
                      </div>
                    </div>
                  ) : (
                    /* 표시 모드 */
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-foreground">{acc.accountName}</span>
                          <a href={`https://${acc.blogName}.tistory.com`} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline flex items-center gap-1">
                            {acc.blogName}.tistory.com <ExternalLink className="w-3 h-3" />
                          </a>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber/15 text-amber">Tier {acc.tier}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                          <span>카카오: {acc.kakaoId}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center gap-1">
                          <Toggle enabled={acc.isActive} onToggle={() => handleToggle(acc.id, 'isActive', acc.isActive)} size="sm" />
                          <span className="text-[10px] text-muted-foreground">활성</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <Toggle enabled={acc.autoPublish} onToggle={() => handleToggle(acc.id, 'autoPublish', acc.autoPublish)} size="sm" />
                          <span className="text-[10px] text-muted-foreground">자동</span>
                        </div>
                        <button onClick={() => { setEditId(acc.id); setEditForm({ accountName: acc.accountName, blogName: acc.blogName, kakaoId: acc.kakaoId, kakaoPassword: '' }) }}
                          className="p-1.5 rounded-md hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(acc.id)}
                          className="p-1.5 rounded-md hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 최근 발행 기록 (1/3) */}
        <div className="glass-panel rounded-xl p-5 lg:col-span-1">
          <h2 className="text-lg font-semibold text-foreground mb-4">발행 기록</h2>
          {postings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Send className="w-8 h-8 mx-auto mb-2 opacity-30" />
              아직 발행 기록이 없습니다
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {postings.map(p => (
                <div key={p.id} className="p-3 rounded-lg border border-border bg-background/40">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-foreground">{p.accountName}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusStyle[p.status] || 'bg-muted text-muted-foreground'}`}>
                      {p.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{p.keyword}</p>
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline">{p.url}</a>
                  )}
                  {p.error && <p className="text-[10px] text-rose-400">{p.error}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(p.createdAt).toLocaleString('ko-KR')}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 스케줄 설정 + 로그 */}
      <div className="glass-panel rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-orange-400" />
            <h2 className="text-lg font-semibold text-foreground">티스토리 자동 포스팅 설정</h2>
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 text-sm font-medium disabled:opacity-50">
                {togglingScheduler ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current" />} 정지
              </button>
            ) : (
              <button onClick={handleStartScheduler} disabled={togglingScheduler}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald/15 text-emerald border border-emerald/30 text-sm font-medium disabled:opacity-50">
                {togglingScheduler ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />} 시작
              </button>
            )}
            <Toggle enabled={autoEngine} onToggle={() => setAutoEngine(!autoEngine)} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 좌: 설정 */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">시작 시간</label>
                <div className="flex items-center gap-1">
                  <select value={startHour} onChange={e => setStartHour(e.target.value)} className="rounded-lg bg-input border border-border px-3 py-2 text-foreground text-sm w-20">
                    {hours.map(h => <option key={h} value={h}>{h}시</option>)}
                  </select>
                  <span className="text-muted-foreground">:</span>
                  <select value={startMin} onChange={e => setStartMin(e.target.value)} className="rounded-lg bg-input border border-border px-3 py-2 text-foreground text-sm w-20">
                    {minutes.map(m => <option key={m} value={m}>{m}분</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">종료 시간</label>
                <div className="flex items-center gap-1">
                  <select value={endHour} onChange={e => setEndHour(e.target.value)} className="rounded-lg bg-input border border-border px-3 py-2 text-foreground text-sm w-20">
                    {hours.map(h => <option key={h} value={h}>{h}시</option>)}
                  </select>
                  <span className="text-muted-foreground">:</span>
                  <select value={endMin} onChange={e => setEndMin(e.target.value)} className="rounded-lg bg-input border border-border px-3 py-2 text-foreground text-sm w-20">
                    {minutes.map(m => <option key={m} value={m}>{m}분</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">포스팅 요일</label>
              <div className="flex gap-2">
                {dayLabels.map((d, i) => (
                  <button key={d} onClick={() => setSelectedDays(prev => prev.map((v, idx) => idx === i ? !v : v))}
                    className={`w-9 h-9 rounded-full text-sm font-medium transition-colors ${
                      selectedDays[i] ? 'bg-orange-500 text-white' : 'border border-border text-muted-foreground hover:border-orange-500'
                    }`}>{d}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">포스팅 간격</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">최소</span>
                <input type="number" value={intervalMin} onChange={e => setIntervalMin(Number(e.target.value))}
                  className="rounded-lg bg-input border border-border px-3 py-2 text-foreground text-sm w-20 text-center" />
                <span className="text-xs text-muted-foreground">~ 최대</span>
                <input type="number" value={intervalMax} onChange={e => setIntervalMax(Number(e.target.value))}
                  className="rounded-lg bg-input border border-border px-3 py-2 text-foreground text-sm w-20 text-center" />
                <span className="text-xs text-muted-foreground">분</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">일일 최대 포스팅</label>
              <input type="number" value={dailyMax} onChange={e => setDailyMax(Number(e.target.value))} min={1}
                className="rounded-lg bg-input border border-border px-4 py-2.5 text-foreground text-sm w-full" />
            </div>

            <button onClick={handleSaveSettings} disabled={savingSettings}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              스케줄 저장
            </button>
          </div>

          {/* 우: 스케줄러 로그 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Terminal className="w-4 h-4 text-orange-400" /> 스케줄러 로그
              </label>
              <span className="text-[10px] text-muted-foreground">5초마다 갱신</span>
            </div>
            <div className="rounded-lg border border-border bg-background/60 h-[320px] overflow-y-auto p-2 font-mono text-[11px] space-y-1">
              {schedulerLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
                  로그 대기 중...
                </div>
              ) : (
                schedulerLogs.map((l, i) => {
                  const t = new Date(l.time)
                  const hhmmss = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}:${String(t.getSeconds()).padStart(2,'0')}`
                  const colors: Record<string, string> = { info: 'text-sky-300', success: 'text-emerald', warn: 'text-amber', error: 'text-rose-400', skip: 'text-muted-foreground' }
                  return (
                    <div key={i} className="flex items-start gap-2 px-1 py-0.5 hover:bg-white/[0.03] rounded">
                      <span className="text-muted-foreground shrink-0">{hhmmss}</span>
                      <span className={`${colors[l.level] || 'text-foreground'} break-all`}>{l.message}</span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
