import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import {
  LayoutDashboard, Package, Bot, Workflow, History, Settings as SettingsIcon,
  LogOut, Sparkles
} from 'lucide-react'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Agents from './pages/Agents'
import Pipeline from './pages/Pipeline'
import HistoryPage from './pages/History'
import SettingsPage from './pages/Settings'
import Login from './pages/Login'
import type { ReactNode } from 'react'

function ProtectedLayout() {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />

  return (
    <div className="flex h-screen bg-background overflow-hidden selection:bg-primary/30">
      <Sidebar />
      <main className="flex-1 relative overflow-y-auto">
        <div className="absolute top-0 left-1/4 w-[40rem] h-[30rem] bg-secondary/8 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-[30rem] h-[20rem] bg-primary/8 blur-[100px] rounded-full pointer-events-none" />
        <div className="relative z-10 w-full max-w-7xl mx-auto p-8 h-full">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/products" element={<Products />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

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

function Sidebar() {
  const handleLogout = () => {
    localStorage.removeItem('token')
    window.location.href = '/login'
  }

  return (
    <nav className="w-64 glass border-r border-white/5 flex flex-col pt-8 pb-4">
      <div className="px-6 mb-10">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary grid place-items-center text-white text-sm font-black">
            D
          </span>
          DailyFNI
        </h1>
        <p className="text-xs text-muted-foreground mt-1 pl-10">AI Blog Automation</p>
      </div>

      <div className="flex-1 px-3 space-y-1">
        <NavItem to="/" icon={<LayoutDashboard size={20} />} label="Dashboard" />
        <NavItem to="/products" icon={<Package size={20} />} label="Products" />
        <NavItem to="/agents" icon={<Bot size={20} />} label="AI Agents" />
        <NavItem to="/pipeline" icon={<Workflow size={20} />} label="Pipeline" />
        <NavItem to="/history" icon={<History size={20} />} label="History" />
        <NavItem to="/settings" icon={<SettingsIcon size={20} />} label="Settings" />
      </div>

      <div className="px-3 mt-4">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-white/5 hover:text-foreground transition-all duration-200 w-full"
        >
          <LogOut size={20} className="opacity-70" />
          Logout
        </button>
      </div>

      <div className="px-6 pt-6 border-t border-white/5 mt-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold border border-primary/30">
            <Sparkles size={18} />
          </div>
          <div className="text-sm">
            <p className="font-semibold text-foreground">Claude Sonnet</p>
            <p className="text-muted-foreground text-xs">AI Engine Active</p>
          </div>
        </div>
      </div>
    </nav>
  )
}

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
