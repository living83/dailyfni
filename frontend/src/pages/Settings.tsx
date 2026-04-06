import { useState, useEffect } from 'react'
import { Save, Users, Shield, Download, Upload, Heart, MessageSquare, Clock, Sliders } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { useFetch, useMutation } from '../hooks/useApi'
import Toggle from '../components/Toggle'
import { PageSkeleton } from '../components/LoadingSkeleton'
import type { SystemSettings } from '../types'

const accountList = [
  '블로그마스터', '대출전문블로그', '재테크블로그',
  '금융정보센터', '생활경제팁', 'IT트렌드블로그',
]

const defaultSettings: SystemSettings = {
  claudeApiKey: '', naverClientId: '', naverClientSecret: '',
  engagementBot: true, engStartHour: '09', engStartMin: '00',
  engEndHour: '18', engEndMin: '00',
  maxVisits: 20, heartLike: true, aiComment: true,
  commentMinLen: 20, commentMaxLen: 80,
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
  const { mutate: saveSettings, loading: saving } = useMutation('/settings', 'put')

  const [form, setForm] = useState<SystemSettings>(defaultSettings)
  const [allAccounts, setAllAccounts] = useState(false)
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, boolean>>(
    Object.fromEntries(accountList.map((a, i) => [a, i < 4]))
  )

  useEffect(() => {
    if (serverData?.settings) setForm({ ...defaultSettings, ...serverData.settings })
  }, [serverData])

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

              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.aiComment} onChange={() => set('aiComment', !form.aiComment)}
                  className="w-4 h-4 rounded accent-primary" />
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <span className="text-sm text-foreground">AI 자동 댓글</span>
                </div>
              </label>
            </div>

            {form.aiComment && (
              <div className="space-y-3 p-4 rounded-lg border border-primary/20 bg-primary/5">
                <p className="text-xs font-medium text-primary">AI 댓글 옵션</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">최소 글자수</label>
                    <input type="number" min={10} max={100} value={form.commentMinLen || 20}
                      onChange={(e) => set('commentMinLen' as any, Number(e.target.value))}
                      className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">최대 글자수</label>
                    <input type="number" min={20} max={200} value={form.commentMaxLen || 80}
                      onChange={(e) => set('commentMaxLen' as any, Number(e.target.value))}
                      className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none" />
                  </div>
                </div>
              </div>
            )}
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
