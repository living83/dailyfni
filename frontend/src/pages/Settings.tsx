import { useState } from 'react'
import { Settings as SettingsIcon, Workflow, Save } from 'lucide-react'

export default function Settings() {
  // Profile & API state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [apiKey, setApiKey] = useState('')

  // Pipeline config state
  const [tones, setTones] = useState({ 친근톤: true, 전문톤: true, 리뷰톤: true })
  const [priority, setPriority] = useState('normal')
  const [autoPublish, setAutoPublish] = useState(false)
  const [scheduleHour, setScheduleHour] = useState('09')
  const [scheduleMinute, setScheduleMinute] = useState('00')
  const [affiliateLink, setAffiliateLink] = useState(true)
  const [platforms, setPlatforms] = useState({ Coupang: true, Naver: true, '11st': true })

  const inputClass =
    'w-full rounded-lg bg-input border border-border px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors'
  const labelClass = 'block text-sm font-medium text-foreground mb-1.5'
  const readonlyClass =
    'w-full rounded-lg bg-muted border border-border px-4 py-2.5 text-muted-foreground cursor-not-allowed'

  const toggleTone = (tone: keyof typeof tones) =>
    setTones((prev) => ({ ...prev, [tone]: !prev[tone] }))

  const togglePlatform = (platform: keyof typeof platforms) =>
    setPlatforms((prev) => ({ ...prev, [platform]: !prev[platform] }))

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
  const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">계정 및 파이프라인 설정을 관리합니다</p>
      </div>

      {/* Section 1: Profile & API */}
      <div className="glass-panel rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2 mb-2">
          <SettingsIcon className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">계정 및 API 설정</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className={labelClass}>Name</label>
            <input type="text" value="Admin User" readOnly className={readonlyClass} />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              value={localStorage.getItem('email') || 'admin@dailyfni.com'}
              readOnly
              className={readonlyClass}
            />
          </div>
          <div>
            <label className={labelClass}>Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="현재 비밀번호"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="새 비밀번호"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-api03-..."
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>AI Model</label>
            <input type="text" value="claude-sonnet-4-5-20250929" readOnly className={readonlyClass} />
          </div>
        </div>

        <div className="pt-2">
          <button className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-primary to-secondary text-white font-medium hover:opacity-90 transition-opacity shadow-lg shadow-primary/25">
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      </div>

      {/* Section 2: Pipeline Configuration */}
      <div className="glass-panel rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2 mb-2">
          <Workflow className="w-5 h-5 text-secondary" />
          <h2 className="text-lg font-semibold text-foreground">파이프라인 설정</h2>
        </div>

        {/* Tone Checkboxes */}
        <div>
          <label className={labelClass}>톤 선택</label>
          <div className="flex items-center gap-5">
            {(Object.keys(tones) as (keyof typeof tones)[]).map((tone) => (
              <label key={tone} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tones[tone]}
                  onChange={() => toggleTone(tone)}
                  className="w-4 h-4 rounded border-border bg-input text-primary focus:ring-primary focus:ring-offset-0 accent-primary"
                />
                <span className="text-sm text-foreground">{tone}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Default Priority */}
        <div>
          <label className={labelClass}>기본 우선순위</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className={`${inputClass} appearance-none`}
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </div>

        {/* Auto-publish Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-foreground">자동 발행</span>
            <p className="text-xs text-muted-foreground">파이프라인 완료 후 자동 발행</p>
          </div>
          <button
            onClick={() => setAutoPublish(!autoPublish)}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              autoPublish ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                autoPublish ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Schedule Time Picker */}
        <div>
          <label className={labelClass}>예약 발행 시간</label>
          <div className="flex items-center gap-2">
            <select
              value={scheduleHour}
              onChange={(e) => setScheduleHour(e.target.value)}
              className={`${inputClass} w-24 appearance-none`}
            >
              {hours.map((h) => (
                <option key={h} value={h}>
                  {h}시
                </option>
              ))}
            </select>
            <span className="text-muted-foreground">:</span>
            <select
              value={scheduleMinute}
              onChange={(e) => setScheduleMinute(e.target.value)}
              className={`${inputClass} w-24 appearance-none`}
            >
              {minutes.map((m) => (
                <option key={m} value={m}>
                  {m}분
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Affiliate Link Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-foreground">제휴 링크</span>
            <p className="text-xs text-muted-foreground">블로그 글에 제휴 링크 자동 삽입</p>
          </div>
          <button
            onClick={() => setAffiliateLink(!affiliateLink)}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              affiliateLink ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                affiliateLink ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Platform Checkboxes */}
        <div>
          <label className={labelClass}>플랫폼</label>
          <div className="flex items-center gap-5">
            {(Object.keys(platforms) as (keyof typeof platforms)[]).map((platform) => (
              <label key={platform} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={platforms[platform]}
                  onChange={() => togglePlatform(platform)}
                  className="w-4 h-4 rounded border-border bg-input text-primary focus:ring-primary focus:ring-offset-0 accent-primary"
                />
                <span className="text-sm text-foreground">{platform}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
