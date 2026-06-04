import { createContext, useContext, type ReactNode } from 'react'

/**
 * 단일 사용자 — 인증 불필요
 * isDemo는 항상 false (모든 데이터가 백엔드 SQLite에 저장됨)
 */
interface AuthState {
  isDemo: boolean
}

const AuthContext = createContext<AuthState>({ isDemo: false })

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider value={{ isDemo: false }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
