import { useState, useRef, useCallback } from 'react'
import api from '../lib/api'

export default function ManualLogin() {
  const [sessionId, setSessionId] = useState('')
  const [screenshot, setScreenshot] = useState('')
  const [url, setUrl] = useState('')
  const [platform, setPlatform] = useState<'naver' | 'tistory'>('naver')
  const [accountId, setAccountId] = useState('')
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [typeText, setTypeText] = useState('')
  const [navUrl, setNavUrl] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const loadAccounts = useCallback(async () => {
    try {
      if (platform === 'naver') {
        const res = await api.get('/accounts')
        setAccounts(res.data.accounts || [])
      } else {
        const res = await api.get('/tistory/accounts')
        setAccounts(res.data.accounts || [])
      }
    } catch { /* ignore */ }
  }, [platform])

  const startSession = async () => {
    if (!accountId) { setMessage('계정을 선택하세요'); return }
    setLoading(true)
    setMessage('')
    const sid = `manual_${Date.now()}`
    try {
      const res = await api.post('/manual-login/start', {
        session_id: sid,
        platform,
      })
      if (res.data.success) {
        setSessionId(sid)
        setScreenshot(res.data.screenshot)
        setUrl(res.data.url || '')
        setMessage('세션 시작됨 — 화면을 클릭하거나 텍스트를 입력하세요')
      } else {
        setMessage(`실패: ${res.data.error}`)
      }
    } catch (err: any) {
      setMessage(`오류: ${err.message}`)
    }
    setLoading(false)
  }

  const refreshScreenshot = async () => {
    if (!sessionId) return
    try {
      const res = await api.get(`/manual-login/screenshot/${sessionId}`)
      if (res.data.success) {
        setScreenshot(res.data.screenshot)
        setUrl(res.data.url || '')
      }
    } catch { /* ignore */ }
  }

  const toggleAutoRefresh = () => {
    if (autoRefresh) {
      if (refreshRef.current) clearInterval(refreshRef.current)
      refreshRef.current = null
      setAutoRefresh(false)
    } else {
      refreshRef.current = setInterval(refreshScreenshot, 2000)
      setAutoRefresh(true)
    }
  }

  const handleClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!sessionId || loading) return
    const img = imgRef.current
    if (!img) return

    const rect = img.getBoundingClientRect()
    const scaleX = 1920 / rect.width
    const scaleY = 1080 / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top) * scaleY)

    setLoading(true)
    try {
      const res = await api.post('/manual-login/click', { session_id: sessionId, x, y })
      if (res.data.success) {
        setScreenshot(res.data.screenshot)
        setUrl(res.data.url || '')
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const handleType = async () => {
    if (!sessionId || !typeText) return
    setLoading(true)
    try {
      const res = await api.post('/manual-login/type', { session_id: sessionId, text: typeText })
      if (res.data.success) {
        setScreenshot(res.data.screenshot)
        setUrl(res.data.url || '')
      }
      setTypeText('')
    } catch { /* ignore */ }
    setLoading(false)
  }

  const handleKey = async (key: string) => {
    if (!sessionId) return
    setLoading(true)
    try {
      const res = await api.post('/manual-login/key', { session_id: sessionId, key })
      if (res.data.success) {
        setScreenshot(res.data.screenshot)
        setUrl(res.data.url || '')
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const handleNavigate = async () => {
    if (!sessionId || !navUrl) return
    setLoading(true)
    try {
      const res = await api.post('/manual-login/navigate', { session_id: sessionId, url: navUrl })
      if (res.data.success) {
        setScreenshot(res.data.screenshot)
        setUrl(res.data.url || '')
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const saveCookies = async () => {
    if (!sessionId || !accountId) return
    setLoading(true)
    try {
      const res = await api.post('/manual-login/save-cookies', {
        session_id: sessionId,
        account_id: accountId,
        platform,
      })
      if (res.data.success) {
        setMessage(`쿠키 저장 완료 (${res.data.cookie_count}개)`)
      } else {
        setMessage(`쿠키 저장 실패: ${res.data.error}`)
      }
    } catch (err: any) {
      setMessage(`오류: ${err.message}`)
    }
    setLoading(false)
  }

  const closeSession = async () => {
    if (!sessionId) return
    if (refreshRef.current) clearInterval(refreshRef.current)
    refreshRef.current = null
    setAutoRefresh(false)
    await api.post(`/manual-login/close/${sessionId}`)
    setSessionId('')
    setScreenshot('')
    setUrl('')
    setMessage('세션 종료됨')
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">수동 로그인</h1>
      <p className="text-muted-foreground text-sm">
        서버 브라우저를 원격 조작하여 로그인 후 쿠키를 저장합니다.
      </p>

      {!sessionId ? (
        <div className="bg-card border border-border rounded-lg p-6 space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium mb-1">플랫폼</label>
            <select
              value={platform}
              onChange={(e) => { setPlatform(e.target.value as any); setAccountId(''); setAccounts([]) }}
              className="w-full bg-background border border-border rounded px-3 py-2"
            >
              <option value="naver">네이버</option>
              <option value="tistory">티스토리 (카카오)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">계정</label>
            <div className="flex gap-2">
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="flex-1 bg-background border border-border rounded px-3 py-2"
              >
                <option value="">계정 선택...</option>
                {accounts.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.accountName || a.naverId || a.id}</option>
                ))}
              </select>
              <button onClick={loadAccounts} className="px-3 py-2 bg-primary/20 rounded text-sm">
                불러오기
              </button>
            </div>
          </div>
          <button
            onClick={startSession}
            disabled={loading || !accountId}
            className="w-full py-2 bg-primary text-white rounded font-medium disabled:opacity-50"
          >
            {loading ? '시작 중...' : '브라우저 시작'}
          </button>
          {message && <p className="text-sm text-yellow-400">{message}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {/* URL 바 */}
          <div className="flex gap-2 items-center">
            <span className="text-xs text-muted-foreground truncate flex-1 bg-card border border-border rounded px-3 py-1.5">
              {url}
            </span>
            <button onClick={refreshScreenshot} className="px-3 py-1.5 bg-card border border-border rounded text-sm">
              새로고침
            </button>
            <button
              onClick={toggleAutoRefresh}
              className={`px-3 py-1.5 rounded text-sm ${autoRefresh ? 'bg-emerald text-white' : 'bg-card border border-border'}`}
            >
              {autoRefresh ? '자동 ON' : '자동 OFF'}
            </button>
          </div>

          {/* 스크린샷 (클릭 가능) */}
          <div className="relative border border-border rounded overflow-hidden bg-black" style={{ maxWidth: '100%' }}>
            {screenshot && (
              <img
                ref={imgRef}
                src={`data:image/jpeg;base64,${screenshot}`}
                onClick={handleClick}
                className="w-full cursor-crosshair"
                style={{ maxHeight: '70vh', objectFit: 'contain' }}
                draggable={false}
              />
            )}
            {loading && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <span className="text-white text-sm">처리 중...</span>
              </div>
            )}
          </div>

          {/* 조작 패널 */}
          <div className="flex flex-wrap gap-2">
            <input
              value={typeText}
              onChange={(e) => setTypeText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleType() }}
              placeholder="텍스트 입력 후 Enter"
              className="flex-1 min-w-[200px] bg-background border border-border rounded px-3 py-2 text-sm"
            />
            <button onClick={handleType} className="px-3 py-2 bg-primary text-white rounded text-sm">입력</button>
            <button onClick={() => handleKey('Enter')} className="px-3 py-2 bg-card border border-border rounded text-sm">Enter</button>
            <button onClick={() => handleKey('Tab')} className="px-3 py-2 bg-card border border-border rounded text-sm">Tab</button>
            <button onClick={() => handleKey('Backspace')} className="px-3 py-2 bg-card border border-border rounded text-sm">BS</button>
          </div>

          {/* URL 이동 */}
          <div className="flex gap-2">
            <input
              value={navUrl}
              onChange={(e) => setNavUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleNavigate() }}
              placeholder="URL 이동 (https://...)"
              className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm"
            />
            <button onClick={handleNavigate} className="px-3 py-2 bg-card border border-border rounded text-sm">이동</button>
          </div>

          {/* 액션 버튼 */}
          <div className="flex gap-2">
            <button
              onClick={saveCookies}
              className="px-4 py-2 bg-emerald text-white rounded font-medium"
            >
              쿠키 저장
            </button>
            <button
              onClick={closeSession}
              className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded"
            >
              세션 종료
            </button>
          </div>

          {message && <p className="text-sm text-yellow-400">{message}</p>}
        </div>
      )}
    </div>
  )
}
