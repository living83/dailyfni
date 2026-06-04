import { useState } from 'react'
import api from '../lib/api'

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/admin/login', { password })
      if (res.data.success) onLogin()
      else setError('비밀번호가 틀렸습니다')
    } catch {
      setError('비밀번호가 틀렸습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="bg-card p-10 rounded-xl w-80 shadow-lg border border-border">
        <h2 className="text-xl font-bold text-center mb-6 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          DailyFNI
        </h2>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="비밀번호"
            autoFocus
            className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 py-3 bg-primary hover:bg-primary/80 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
        {error && <p className="text-red-400 text-center text-sm mt-3">{error}</p>}
      </div>
    </div>
  )
}
