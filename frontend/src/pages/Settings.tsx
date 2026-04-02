import { useState } from 'react'
import {
  Save,
  Eye,
  EyeOff,
  Key,
  Calendar,
  Users,
  Shield,
  Download,
  Upload,
} from 'lucide-react'

/* ── Reusable toggle component ── */
function Toggle({
  enabled,
  onToggle,
}: {
  enabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        enabled ? 'bg-primary' : 'bg-muted'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

/* ── Mock account list ── */
const accountList = [
  '블로그마스터',
  '대출전문블로그',
  '재테크블로그',
  '금융정보센터',
  '생활경제팁',
  'IT트렌드블로그',
]

export default function Settings() {
  // API Keys
  const [showClaudeKey, setShowClaudeKey] = useState(false)
  const [claudeApiKey, setClaudeApiKey] = useState('')
  const [naverClientId, setNaverClientId] = useState('')
  const [showNaverSecret, setShowNaverSecret] = useState(false)
  const [naverClientSecret, setNaverClientSecret] = useState('')

  // Posting Schedule
  const [masterEngine, setMasterEngine] = useState(true)
  const [postStartHour, setPostStartHour] = useState('09')
  const [postStartMin, setPostStartMin] = useState('00')
  const [postEndHour, setPostEndHour] = useState('18')
  const [postEndMin, setPostEndMin] = useState('00')
  const [selectedDays, setSelectedDays] = useState([true, true, true, true, true, false, false])
  const [randomRest, setRandomRest] = useState(true)
  const [postIntervalMin, setPostIntervalMin] = useState(30)
  const [postIntervalMax, setPostIntervalMax] = useState(90)

  // Engagement Settings
  const [engagementBot, setEngagementBot] = useState(true)
  const [engStartHour, setEngStartHour] = useState('09')
  const [engStartMin, setEngStartMin] = useState('00')
  const [maxVisits, setMaxVisits] = useState(20)
  const [heartLike, setHeartLike] = useState(true)
  const [aiComment, setAiComment] = useState(true)
  const [allAccounts, setAllAccounts] = useState(false)
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, boolean>>(
    Object.fromEntries(accountList.map((a, i) => [a, i < 4]))
  )

  // System & Security
  const [logLevel, setLogLevel] = useState('정보')
  const [logRetention, setLogRetention] = useState('30일')
  const [proxyCheck, setProxyCheck] = useState(true)
  const [proxyInterval, setProxyInterval] = useState('6시간')

  const dayLabels = ['월', '화', '수', '목', '금', '토', '일']
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
  const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

  const inputClass =
    'w-full rounded-lg bg-input border border-border px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors'
  const labelClass = 'block text-sm font-medium text-foreground mb-1.5'
  const selectClass =
    'rounded-lg bg-input border border-border px-4 py-2.5 text-foreground focus:border-primary focus:outline-none transition-colors appearance-none'

  const toggleDay = (idx: number) =>
    setSelectedDays((prev) => prev.map((v, i) => (i === idx ? !v : v)))

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">시스템 설정</h1>
          <p className="text-sm text-muted-foreground">
            API 키, 프록시, 시스템 환경을 관리합니다
          </p>
        </div>
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-primary to-secondary text-white font-medium hover:opacity-90 transition-opacity shadow-lg shadow-primary/25">
          <Save className="w-4 h-4" />
          설정 저장
        </button>
      </div>

      {/* 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ─── Panel 1: API 키 관리 ─── */}
        <div className="glass-panel rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">API 키 관리</h2>
          </div>

          {/* Claude API Key */}
          <div>
            <label className={labelClass}>Claude API Key</label>
            <div className="relative">
              <input
                type={showClaudeKey ? 'text' : 'password'}
                value={claudeApiKey}
                onChange={(e) => setClaudeApiKey(e.target.value)}
                placeholder="sk-ant-api03-..."
                className={inputClass}
              />
              <button
                onClick={() => setShowClaudeKey(!showClaudeKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showClaudeKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">API 상태</span>
              <span className="flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald" />
                <span className="text-emerald">연결됨</span>
              </span>
            </div>
          </div>

          {/* Naver API */}
          <div>
            <label className={labelClass}>Naver API Client ID</label>
            <input
              type="text"
              value={naverClientId}
              onChange={(e) => setNaverClientId(e.target.value)}
              placeholder="네이버 API 클라이언트 ID"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Naver API Client Secret</label>
            <div className="relative">
              <input
                type={showNaverSecret ? 'text' : 'password'}
                value={naverClientSecret}
                onChange={(e) => setNaverClientSecret(e.target.value)}
                placeholder="네이버 API 클라이언트 시크릿"
                className={inputClass}
              />
              <button
                onClick={() => setShowNaverSecret(!showNaverSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showNaverSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Expiry */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">API 키 만료일</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground">2026-12-31</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald/15 text-emerald text-xs font-medium">
                274일 남음
              </span>
            </div>
          </div>

          {/* Usage */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">API 사용량</span>
              <span className="text-xs text-foreground">이번 달: 2,847 / 10,000 요청</span>
            </div>
            <div className="w-full h-2 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: '28.47%' }}
              />
            </div>
          </div>
        </div>

        {/* ─── Panel 2: 포스팅 스케줄 ─── */}
        <div className="glass-panel rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-secondary" />
            <h2 className="text-lg font-semibold text-foreground">포스팅 스케줄</h2>
          </div>

          {/* Master Engine Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-foreground">마스터 엔진</span>
              <p className="text-xs text-muted-foreground">자동 포스팅 엔진</p>
            </div>
            <Toggle enabled={masterEngine} onToggle={() => setMasterEngine(!masterEngine)} />
          </div>

          {/* Start Time */}
          <div>
            <label className={labelClass}>포스팅 시작 시간</label>
            <div className="flex items-center gap-2">
              <select
                value={postStartHour}
                onChange={(e) => setPostStartHour(e.target.value)}
                className={`${selectClass} w-24`}
              >
                {hours.map((h) => (
                  <option key={h} value={h}>{h}시</option>
                ))}
              </select>
              <span className="text-muted-foreground">:</span>
              <select
                value={postStartMin}
                onChange={(e) => setPostStartMin(e.target.value)}
                className={`${selectClass} w-24`}
              >
                {minutes.map((m) => (
                  <option key={m} value={m}>{m}분</option>
                ))}
              </select>
            </div>
          </div>

          {/* End Time */}
          <div>
            <label className={labelClass}>포스팅 종료 시간</label>
            <div className="flex items-center gap-2">
              <select
                value={postEndHour}
                onChange={(e) => setPostEndHour(e.target.value)}
                className={`${selectClass} w-24`}
              >
                {hours.map((h) => (
                  <option key={h} value={h}>{h}시</option>
                ))}
              </select>
              <span className="text-muted-foreground">:</span>
              <select
                value={postEndMin}
                onChange={(e) => setPostEndMin(e.target.value)}
                className={`${selectClass} w-24`}
              >
                {minutes.map((m) => (
                  <option key={m} value={m}>{m}분</option>
                ))}
              </select>
            </div>
          </div>

          {/* Day Selection */}
          <div>
            <label className={labelClass}>포스팅 요일</label>
            <div className="flex items-center gap-2">
              {dayLabels.map((day, idx) => (
                <button
                  key={day}
                  onClick={() => toggleDay(idx)}
                  className={`w-9 h-9 rounded-full text-sm font-medium transition-colors ${
                    selectedDays[idx]
                      ? 'bg-primary text-white'
                      : 'border border-border text-muted-foreground hover:border-primary hover:text-foreground'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          {/* Random Rest */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={randomRest}
              onChange={() => setRandomRest(!randomRest)}
              className="w-4 h-4 rounded border-border bg-input text-primary focus:ring-primary focus:ring-offset-0 accent-primary"
            />
            <div>
              <span className="text-sm text-foreground">랜덤 휴식</span>
              <p className="text-xs text-muted-foreground">10% 확률로 하루 쉬기 (어뷰징 방지)</p>
            </div>
          </label>

          {/* Posting Interval */}
          <div>
            <label className={labelClass}>포스팅 간격</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">최소</span>
              <input
                type="number"
                value={postIntervalMin}
                onChange={(e) => setPostIntervalMin(Number(e.target.value))}
                className={`${selectClass} w-20 text-center`}
              />
              <span className="text-sm text-muted-foreground">분 ~ 최대</span>
              <input
                type="number"
                value={postIntervalMax}
                onChange={(e) => setPostIntervalMax(Number(e.target.value))}
                className={`${selectClass} w-20 text-center`}
              />
              <span className="text-sm text-muted-foreground">분</span>
            </div>
          </div>
        </div>

        {/* ─── Panel 3: 이웃참여 설정 ─── */}
        <div className="glass-panel rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald" />
            <h2 className="text-lg font-semibold text-foreground">이웃참여 설정</h2>
          </div>

          {/* Engagement Bot Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-foreground">이웃참여 봇</span>
              <p className="text-xs text-muted-foreground">자동 이웃참여 활성화</p>
            </div>
            <Toggle enabled={engagementBot} onToggle={() => setEngagementBot(!engagementBot)} />
          </div>

          {/* Engagement Start Time */}
          <div>
            <label className={labelClass}>참여 시작 시간</label>
            <div className="flex items-center gap-2">
              <select
                value={engStartHour}
                onChange={(e) => setEngStartHour(e.target.value)}
                className={`${selectClass} w-24`}
              >
                {hours.map((h) => (
                  <option key={h} value={h}>{h}시</option>
                ))}
              </select>
              <span className="text-muted-foreground">:</span>
              <select
                value={engStartMin}
                onChange={(e) => setEngStartMin(e.target.value)}
                className={`${selectClass} w-24`}
              >
                {minutes.map((m) => (
                  <option key={m} value={m}>{m}분</option>
                ))}
              </select>
            </div>
          </div>

          {/* Max Visits Slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-foreground">계정당 최대 방문 수</label>
              <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-medium">
                {maxVisits}회
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              value={maxVisits}
              onChange={(e) => setMaxVisits(Number(e.target.value))}
              className="w-full h-2 rounded-full bg-muted appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>1</span>
              <span>50</span>
            </div>
          </div>

          {/* Heart Like */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={heartLike}
              onChange={() => setHeartLike(!heartLike)}
              className="w-4 h-4 rounded border-border bg-input text-primary focus:ring-primary focus:ring-offset-0 accent-primary"
            />
            <span className="text-sm text-foreground">하트 공감</span>
          </label>

          {/* AI Comment */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={aiComment}
              onChange={() => setAiComment(!aiComment)}
              className="w-4 h-4 rounded border-border bg-input text-primary focus:ring-primary focus:ring-offset-0 accent-primary"
            />
            <span className="text-sm text-foreground">AI 자동 댓글</span>
          </label>

          {/* Account Selection */}
          <div>
            <label className={labelClass}>참여 계정 선택</label>
            <div className="space-y-2 rounded-lg border border-border bg-card/50 p-3">
              <label className="flex items-center gap-3 cursor-pointer border-b border-border pb-2">
                <input
                  type="checkbox"
                  checked={allAccounts}
                  onChange={toggleAllAccounts}
                  className="w-4 h-4 rounded border-border bg-input text-primary focus:ring-primary focus:ring-offset-0 accent-primary"
                />
                <span className="text-sm font-medium text-foreground">전체 계정</span>
              </label>
              {accountList.map((account) => (
                <label key={account} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedAccounts[account] ?? false}
                    onChange={() => toggleAccount(account)}
                    className="w-4 h-4 rounded border-border bg-input text-primary focus:ring-primary focus:ring-offset-0 accent-primary"
                  />
                  <span className="text-sm text-foreground">{account}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Panel 4: 시스템 및 보안 ─── */}
        <div className="glass-panel rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber" />
            <h2 className="text-lg font-semibold text-foreground">시스템 및 보안</h2>
          </div>

          {/* Data Path */}
          <div>
            <label className={labelClass}>데이터 저장 경로</label>
            <input
              type="text"
              value="C:\DailyFNI\data"
              readOnly
              className="w-full rounded-lg bg-muted border border-border px-4 py-2.5 text-muted-foreground cursor-not-allowed"
            />
          </div>

          {/* Log Level */}
          <div>
            <label className={labelClass}>로그 수준</label>
            <select
              value={logLevel}
              onChange={(e) => setLogLevel(e.target.value)}
              className={`${selectClass} w-full`}
            >
              <option value="정보">정보</option>
              <option value="경고">경고</option>
              <option value="오류">오류</option>
              <option value="디버그">디버그</option>
            </select>
          </div>

          {/* Log Retention */}
          <div>
            <label className={labelClass}>로그 보관 기간</label>
            <select
              value={logRetention}
              onChange={(e) => setLogRetention(e.target.value)}
              className={`${selectClass} w-full`}
            >
              <option value="7일">7일</option>
              <option value="14일">14일</option>
              <option value="30일">30일</option>
              <option value="90일">90일</option>
            </select>
          </div>

          {/* Backup / Restore */}
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-foreground text-sm font-medium hover:border-primary hover:text-primary transition-colors">
              <Download className="w-4 h-4" />
              설정 백업
            </button>
            <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-foreground text-sm font-medium hover:border-primary hover:text-primary transition-colors">
              <Upload className="w-4 h-4" />
              설정 복원
            </button>
          </div>

          {/* Proxy Auto-check */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-foreground">프록시 자동 점검</span>
              <p className="text-xs text-muted-foreground">프록시 상태를 주기적으로 확인</p>
            </div>
            <Toggle enabled={proxyCheck} onToggle={() => setProxyCheck(!proxyCheck)} />
          </div>

          {/* Proxy Interval */}
          <div>
            <label className={labelClass}>점검 주기</label>
            <select
              value={proxyInterval}
              onChange={(e) => setProxyInterval(e.target.value)}
              className={`${selectClass} w-full`}
            >
              <option value="1시간">1시간</option>
              <option value="6시간">6시간</option>
              <option value="12시간">12시간</option>
              <option value="24시간">24시간</option>
            </select>
          </div>

          {/* Version */}
          <div className="pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              DailyFNI v1.0.0 | Claude Sonnet 4.5
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
