import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, PenTool, Send, BarChart3, Heart,
  Settings as SettingsIcon, LogOut
} from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Accounts from './pages/Accounts'
import Content from './pages/Content'
import Posting from './pages/Posting'
import Monitoring from './pages/Monitoring'
import Engagement from './pages/Engagement'
import SettingsPage from './pages/Settings'
import Login from './pages/Login'
import { type ReactNode } from 'react'
import { useAuth } from './contexts/AuthContext'

/* ── Navigation items ── */
const navItems = [
  { to: '/', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
  { to: '/accounts', icon: <Users size={20} />, label: '계정/프록시 관리' },
  { to: '/content', icon: <PenTool size={20} />, label: '콘텐츠 생성' },
  { to: '/posting', icon: <Send size={20} />, label: '포스팅 관리' },
  { to: '/monitoring', icon: <BarChart3 size={20} />, label: '모니터링' },
  { to: '/engagement', icon: <Heart size={20} />, label: '이웃참여' },
  { to: '/settings', icon: <SettingsIcon size={20} />, label: '설정' },
]

/* ── Nav link ── */
function NavItem({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  const location = useLocation()
  const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)

  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
        isActive
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
      }`}
    >
      <span className={isActive ? 'opacity-100' : 'opacity-70'}>{icon}</span>
      {label}
    </Link>
  )
}

/* ── Sidebar ── */
function Sidebar() {
  const { logout } = useAuth()
  const systemActive = true

  return (
    <nav className="w-64 bg-card border-r border-border flex flex-col pt-8 pb-4">
      {/* Brand */}
      <div className="px-6 mb-10">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary grid place-items-center text-white text-sm font-black shrink-0">
            D
          </span>
          <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            DailyFNI
          </span>
        </h1>
        <p className="text-xs text-muted-foreground mt-1 pl-10">블로그 자동화 솔루션</p>
      </div>

      {/* Navigation */}
      <div className="flex-1 px-3 space-y-1">
        {navItems.map((item) => (
          <NavItem key={item.to} to={item.to} icon={item.icon} label={item.label} />
        ))}
      </div>

      {/* Logout */}
      <div className="px-3 mt-4">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground transition-all duration-200 w-full"
        >
          <LogOut size={20} className="opacity-70" />
          Logout
        </button>
      </div>

      {/* System Status */}
      <div className="px-6 pt-6 border-t border-border mt-2">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            {systemActive && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald opacity-75" />
            )}
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                systemActive ? 'bg-emerald' : 'bg-muted-foreground'
              }`}
            />
          </span>
          <span className="text-sm text-muted-foreground">
            {systemActive ? 'System Active' : 'System Paused'}
          </span>
        </div>
      </div>
    </nav>
  )
}

/* ── Protected layout ── */
function ProtectedLayout() {
  const { token, isLoading } = useAuth()
  if (isLoading) return null
  if (!token) return <Navigate to="/login" replace />

  return (
    <div className="flex h-screen bg-background overflow-hidden selection:bg-primary/30">
      <Sidebar />
      <main className="flex-1 relative overflow-y-auto">
        {/* Ambient glow */}
        <div className="absolute top-0 left-1/4 w-[40rem] h-[30rem] bg-secondary/8 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-[30rem] h-[20rem] bg-primary/8 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative z-10 w-full max-w-7xl mx-auto p-8 h-full">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/content" element={<Content />} />
            <Route path="/posting" element={<Posting />} />
            <Route path="/monitoring" element={<Monitoring />} />
            <Route path="/engagement" element={<Engagement />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

/* ── App root ── */
export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<ProtectedLayout />} />
      </Routes>
    </Router>
  )
}
