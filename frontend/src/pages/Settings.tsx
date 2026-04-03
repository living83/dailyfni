import { useState, useEffect } from 'react'
import { Save, Eye, EyeOff, Key, Users, Shield, Download, Upload } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useFetch, useMutation } from '../hooks/useApi'
import Toggle from '../components/Toggle'
import { PageSkeleton } from '../components/LoadingSkeleton'
import type { SystemSettings } from '../types'

const accountList = [
  '블로그마스터', '대출전문블로그', '재테크블로그',
  '금융정보센터', '생활경제팁', 'IT트렌드블로그',
]

// Demo fallback
const demoSettings: SystemSettings = {
  claudeApiKey: '',
  naverClientId: '',
  naverClientSecret: '',
  engagementBot: true,
  engStartHour: '09',
  engStartMin: '00',
  maxVisits: 20,
  heartLike: true,
  aiComment: true,
  engagementAccountIds: [],
  logLevel: '정보',
  logRetention: '30일',
  proxyAutoCheck: true,
  proxyCheckInterval: '6시간',
}

export default function Settings() {
  const { isDemo } = useAuth()
  const { toast } = useToast()

  const { data: serverData, loading: fetchLoading } = useFetch<{ settings: SystemSettings }>(
    isDemo ? null : '/settings'
  )
  const { mutate: saveSettings, loading: saving } = useMutation('/settings', 'put')

  // Form state
  const [showClaudeKey, setShowClaudeKey] = useState(false)
  const [showNaverSecret, setShowNaverSecret] = useState(false)
  const [form, setForm] = useState<SystemSettings>(demoSettings)

  // Sync server data → form
  useEffect(() => {
    if (serverData?.settings) setForm(serverData.settings)
  }, [serverData])

  const set = <K extends keyof SystemSettings>(key: K, val: SystemSettings[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    if (isDemo) {
      toast('info', '데모 모드에서는 설정이 저장되지 않습니다.')
      return
    }
    const result = await saveSettings(form)
    if (result) toast('success', '설정이 저장되었습니다.')
    else toast('error', '설정 저장에 실패했습니다.')
  }

  const [allAccounts, setAllAccounts] = useState(false)
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, boolean>>(
    Object.fromEntries(accountList.map((a, i) => [a, i < 4]))
  )

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
  const inputClass = 'w-full rounded-lg bg-input border border-border px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors'
  const labelClass = 'block text-sm font-medium text-foreground mb-1.5'
  const selectClass = 'rounded-lg bg-input border border-border px-4 py-2.5 text-foreground focus:border-primary focus:outline-none transition-colors appearance-none'

  if (fetchLoading) return <PageSkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">시스템 설정</h1>
          <p className="text-sm text-muted-foreground">API 키, 이웃참여, 시스템 환경을 관리합니다</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-primary to-secondary text-white font-medium hover:opacity-90 transition-opacity shadow-lg shadow-primary/25 disabled:opacity-50"
        >
          {saving
            ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <Save className="w-4 h-4" />}
          설정 저장
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Panel 1: API 키 */}
        <div className="glass-panel rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">API 키 관리</h2>
          </div>

          <div>
            <label className={labelClass}>Claude API Key</label>
            <div className="relative">
              <input
                type={showClaudeKey ? 'text' : 'password'}
                value={form.claudeApiKey}
                onChange={(e) => set('claudeApiKey', e.target.value)}
                placeholder="sk-ant-api03-..."
                className={inputClass}
              />
              <button onClick={() => setShowClaudeKey(!showClaudeKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showClaudeKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">API 상태</span>
              <span className="flex items-center gap-1.5 text-xs">
                <span className={`w-2 h-2 rounded-full ${form.claudeApiKey ? 'bg-emerald' : 'bg-muted-foreground'}`} />
                <span className={form.claudeApiKey ? 'text-emerald' : 'text-muted-foreground'}>
                  {form.claudeApiKey ? '연결됨' : '미설정'}
                </span>
              </span>
            </div>
          </div>

          <div>
            <label className={labelClass}>Naver API Client ID</label>
            <input type="text" value={form.naverClientId} onChange={(e) => set('naverClientId', e.target.value)}
              placeholder="네이버 API 클라이언트 ID" className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Naver API Client Secret</label>
            <div className="relative">
              <input type={showNaverSecret ? 'text' : 'password'} value={form.naverClientSecret}
                onChange={(e) => set('naverClientSecret', e.target.value)}
                placeholder="네이버 API 클라이언트 시크릿" className={inputClass} />
              <button onClick={() => setShowNaverSecret(!showNaverSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showNaverSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">API 키 만료일</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground">2026-12-31</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald/15 text-emerald text-xs font-medium">274일 남음</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">API 사용량</span>
              <span className="text-xs text-foreground">이번 달: 2,847 / 10,000 요청</span>
            </div>
            <div className="w-full h-2 rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: '28.47%' }} />
            </div>
          </div>
        </div>

        {/* Panel 2: 이웃참여 설정 */}
        <div className="glass-panel rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald" />
            <h2 className="text-lg font-semibold text-foreground">이웃참여 설정</h2>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-foreground">이웃참여 봇</span>
              <p className="text-xs text-muted-foreground">자동 이웃참여 활성화</p>
            </div>
            <Toggle enabled={form.engagementBot} onToggle={() => set('engagementBot', !form.engagementBot)} />
          </div>

          <div>
            <label className={labelClass}>참여 시작 시간</label>
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-foreground">계정당 최대 방문 수</label>
              <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-medium">{form.maxVisits}회</span>
            </div>
            <input type="range" min={1} max={50} value={form.maxVisits}
              onChange={(e) => set('maxVisits', Number(e.target.value))}
              className="w-full h-2 rounded-full bg-muted appearance-none cursor-pointer accent-primary" />
            <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>1</span><span>50</span></div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.heartLike} onChange={() => set('heartLike', !form.heartLike)}
              className="w-4 h-4 rounded accent-primary" />
            <span className="text-sm text-foreground">하트 공감</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.aiComment} onChange={() => set('aiComment', !form.aiComment)}
              className="w-4 h-4 rounded accent-primary" />
            <span className="text-sm text-foreground">AI 자동 댓글</span>
          </label>

          <div>
            <label className={labelClass}>참여 계정 선택</label>
            <div className="space-y-2 rounded-lg border border-border bg-card/50 p-3">
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
          </div>
        </div>

        {/* Panel 3: 시스템 및 보안 */}
        <div className="glass-panel rounded-xl p-5 space-y-5 lg:col-span-2">
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
                <div>
                  <span className="text-sm font-medium text-foreground">프록시 자동 점검</span>
                </div>
                <Toggle enabled={form.proxyAutoCheck} onToggle={() => set('proxyAutoCheck', !form.proxyAutoCheck)} size="sm" />
              </div>
              <select value={form.proxyCheckInterval} onChange={(e) => set('proxyCheckInterval', e.target.value)} className={`${selectClass} w-28`}>
                <option>1시간</option><option>6시간</option><option>12시간</option><option>24시간</option>
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">DailyFNI v1.0.0 | Claude Sonnet 4.5</p>
          </div>
        </div>
      </div>
    </div>
  )
}
