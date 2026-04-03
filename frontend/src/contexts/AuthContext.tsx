import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import api from '../lib/api'
import type { User } from '../types'

interface AuthState {
  user: User | null
  token: string | null
  isDemo: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  loginDemo: () => void
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

const DEMO_USER: User = {
  id: 'demo',
  email: 'demo@dailyfni.com',
  name: 'Demo User',
  role: 'admin',
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))
  const [isLoading, setIsLoading] = useState(true)

  const isDemo = token === 'demo-token'

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
  }, [])

  // Verify token on mount
  useEffect(() => {
    if (!token) {
      setIsLoading(false)
      return
    }
    if (token === 'demo-token') {
      setUser(DEMO_USER)
      setIsLoading(false)
      return
    }
    api.get('/auth/me')
      .then(({ data }) => setUser(data.user ?? data))
      .catch(() => logout())
      .finally(() => setIsLoading(false))
  }, [token, logout])

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('token', data.token)
    setToken(data.token)
    setUser(data.user ?? { id: '', email, name: email, role: 'user' as const })
  }

  const loginDemo = () => {
    localStorage.setItem('token', 'demo-token')
    setToken('demo-token')
    setUser(DEMO_USER)
  }

  return (
    <AuthContext.Provider value={{ user, token, isDemo, isLoading, login, loginDemo, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
