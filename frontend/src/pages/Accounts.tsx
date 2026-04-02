import { useState } from 'react'
import {
  UserPlus,
  Pencil,
  Trash2,
  Shield,
  Wifi,
  WifiOff,
  X,
  Lock,
  Plus,
  Zap,
} from 'lucide-react'

/* ── Types ── */
interface Account {
  id: number
  name: string
  naverId: string
  tier: 1 | 2 | 3 | 4 | 5
  proxy: string | null
  active: boolean
  autoPublish: boolean
  neighborEngage: boolean
}

interface Proxy {
  id: number
  ip: string
  username: string
  status: '정상' | '느림' | '오류'
  speed: string
  assignedAccount: string | null
}

/* ── Tier config ── */
const tierConfig: Record<number, { label: string; color: string }> = {
  1: { label: 'Tier 1', color: 'bg-muted-foreground/20 text-muted-foreground' },
  2: { label: 'Tier 2', color: 'bg-primary/15 text-primary' },
  3: { label: 'Tier 3', color: 'bg-violet-500/15 text-violet-400' },
  4: { label: 'Tier 4', color: 'bg-amber/15 text-amber' },
  5: { label: 'Tier 5', color: 'bg-emerald/15 text-emerald' },
}

/* ── Mock data ── */
const mockAccounts: Account[] = [
  { id: 1, name: '블로그마스터', naverId: 'blog_master99', tier: 5, proxy: '103.15.22.41:8080', active: true, autoPublish: true, neighborEngage: true },
  { id: 2, name: '대출전문블로그', naverId: 'loan_expert01', tier: 4, proxy: '198.44.67.12:3128', active: true, autoPublish: true, neighborEngage: false },
  { id: 3, name: '마케팅신입01', naverId: 'mkt_newbie01', tier: 1, proxy: null, active: true, autoPublish: false, neighborEngage: false },
  { id: 4, name: '금융정보센터', naverId: 'fin_info_center', tier: 3, proxy: '45.77.123.88:1080', active: true, autoPublish: true, neighborEngage: true },
  { id: 5, name: '생활꿀팁모음', naverId: 'life_tips_kr', tier: 2, proxy: '172.16.0.55:8888', active: true, autoPublish: false, neighborEngage: true },
  { id: 6, name: '재테크달인', naverId: 'money_guru777', tier: 2, proxy: null, active: false, autoPublish: false, neighborEngage: false },
]

const mockProxies: Proxy[] = [
  { id: 1, ip: '103.15.22.41:8080', username: 'proxy_user1', status: '정상', speed: '45ms', assignedAccount: '블로그마스터' },
  { id: 2, ip: '198.44.67.12:3128', username: 'proxy_user2', status: '정상', speed: '120ms', assignedAccount: '대출전문블로그' },
  { id: 3, ip: '45.77.123.88:1080', username: 'proxy_user3', status: '느림', speed: '350ms', assignedAccount: '금융정보센터' },
  { id: 4, ip: '172.16.0.55:8888', username: 'proxy_user4', status: '오류', speed: 'timeout', assignedAccount: '생활꿀팁모음' },
]

const statusColor: Record<string, string> = {
  '정상': 'bg-emerald/15 text-emerald',
  '느림': 'bg-amber/15 text-amber',
  '오류': 'bg-destructive/15 text-destructive',
}

/* ── Toggle Switch ── */
function Toggle({ on, size = 'md' }: { on: boolean; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 'w-8 h-4' : 'w-10 h-5'
  const dot = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'
  const translate = size === 'sm' ? 'translate-x-4' : 'translate-x-5'
  return (
    <span
      className={`relative inline-flex ${w} shrink-0 cursor-pointer rounded-full transition-colors ${
        on ? 'bg-primary' : 'bg-muted'
      }`}
    >
      <span
        className={`pointer-events-none inline-block ${dot} transform rounded-full bg-white shadow transition-transform ${
          on ? translate : 'translate-x-0.5'
        }`}
        style={{ marginTop: size === 'sm' ? '2px' : '2.5px' }}
      />
    </span>
  )
}

/* ── Account Card ── */
function AccountCard({ account }: { account: Account }) {
  const tc = tierConfig[account.tier]
  const avatarColors = [
    'bg-primary', 'bg-emerald', 'bg-amber', 'bg-violet-500', 'bg-secondary', 'bg-rose-500',
  ]
  const avatarColor = avatarColors[account.id % avatarColors.length]

  return (
    <div className="group glass-panel rounded-xl p-5 relative transition-all hover:border-primary/30">
      {/* Hover actions */}
      <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="p-1.5 rounded-lg bg-muted hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button className="p-1.5 rounded-lg bg-muted hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Top row: avatar + info */}
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-full ${avatarColor} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
          {account.name[0]}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{account.name}</p>
          <p className="text-xs text-muted-foreground truncate">{account.naverId}</p>
        </div>
      </div>

      {/* Tier + Proxy */}
      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${tc.color}`}>
          {tc.label}
        </span>
        <span className="text-xs text-muted-foreground">|</span>
        {account.proxy ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Wifi className="w-3 h-3 text-emerald" />
            {account.proxy.split(':')[0]}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-destructive">
            <WifiOff className="w-3 h-3" />
            미할당
          </span>
        )}
      </div>

      {/* Status toggle */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-border">
        <span className="text-xs text-muted-foreground">상태</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${account.active ? 'text-emerald' : 'text-muted-foreground'}`}>
            {account.active ? '활성' : '비활성'}
          </span>
          <Toggle on={account.active} size="sm" />
        </div>
      </div>

      {/* Bottom toggles */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Toggle on={account.autoPublish} size="sm" />
          <span className="text-muted-foreground">자동 발행</span>
        </div>
        <div className="flex items-center gap-2">
          <Toggle on={account.neighborEngage} size="sm" />
          <span className="text-muted-foreground">이웃 참여</span>
        </div>
      </div>
    </div>
  )
}

/* ── Add Account Modal ── */
function AddAccountModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="glass-panel rounded-2xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-foreground">계정 추가</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">별칭</label>
            <input
              type="text"
              placeholder="예: 블로그마스터"
              className="w-full px-3 py-2 rounded-lg bg-input border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">Naver ID</label>
            <input
              type="text"
              placeholder="네이버 아이디 입력"
              className="w-full px-3 py-2 rounded-lg bg-input border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1.5">Naver Password</label>
            <input
              type="password"
              placeholder="비밀번호 입력"
              className="w-full px-3 py-2 rounded-lg bg-input border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Tier</label>
              <select className="w-full px-3 py-2 rounded-lg bg-input border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="1">Tier 1 - 신규</option>
                <option value="2">Tier 2 - 성장</option>
                <option value="3">Tier 3 - 중급</option>
                <option value="4">Tier 4 - 고수익</option>
                <option value="5">Tier 5 - 최상위</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">프록시</label>
              <select className="w-full px-3 py-2 rounded-lg bg-input border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="auto">자동 할당</option>
                {mockProxies.map((p) => (
                  <option key={p.id} value={p.ip}>{p.ip}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
            <Lock className="w-3.5 h-3.5" />
            <span>계정 정보는 AES256으로 암호화되어 저장됩니다</span>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            취소
          </button>
          <button className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            저장
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main Page ── */
export default function Accounts() {
  const [tab, setTab] = useState<'accounts' | 'proxy'>('accounts')
  const [showModal, setShowModal] = useState(false)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">계정 및 프록시 관리</h1>
          <p className="text-sm text-muted-foreground">Naver 계정과 프록시를 등록하고 안전하게 관리합니다</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          계정 추가
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted w-fit">
        <button
          onClick={() => setTab('accounts')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'accounts'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Naver 계정
          </div>
        </button>
        <button
          onClick={() => setTab('proxy')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'proxy'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4" />
            프록시 서버
          </div>
        </button>
      </div>

      {/* Tab Content: Accounts */}
      {tab === 'accounts' && (
        <div className="glass-panel rounded-xl p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mockAccounts.map((account) => (
              <AccountCard key={account.id} account={account} />
            ))}
          </div>
        </div>
      )}

      {/* Tab Content: Proxy */}
      {tab === 'proxy' && (
        <div className="glass-panel rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">등록된 프록시</h2>
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              <Plus className="w-3.5 h-3.5" />
              프록시 추가
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="pb-3 font-medium">IP:Port</th>
                  <th className="pb-3 font-medium">사용자명</th>
                  <th className="pb-3 font-medium">상태</th>
                  <th className="pb-3 font-medium">속도</th>
                  <th className="pb-3 font-medium">할당 계정</th>
                  <th className="pb-3 font-medium">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mockProxies.map((proxy) => (
                  <tr key={proxy.id} className="text-foreground">
                    <td className="py-3 font-mono text-xs">{proxy.ip}</td>
                    <td className="py-3 text-muted-foreground">{proxy.username}</td>
                    <td className="py-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor[proxy.status]}`}>
                        {proxy.status}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`text-xs font-mono ${
                        proxy.speed === 'timeout' ? 'text-destructive' :
                        parseInt(proxy.speed) > 200 ? 'text-amber' : 'text-emerald'
                      }`}>
                        {proxy.speed}
                      </span>
                    </td>
                    <td className="py-3 text-muted-foreground">{proxy.assignedAccount ?? '—'}</td>
                    <td className="py-3">
                      <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-muted hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors">
                        <Zap className="w-3 h-3" />
                        연결 테스트
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && <AddAccountModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
