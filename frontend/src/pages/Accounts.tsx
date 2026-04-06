import { useState, useEffect, useCallback } from 'react'
import { UserPlus, Pencil, Trash2, Shield, Wifi, X, Plus } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import api from '../lib/api'
import Toggle from '../components/Toggle'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import { PageSkeleton } from '../components/LoadingSkeleton'
import type { Account, Proxy } from '../types'

const tierConfig: Record<number, { label: string; color: string }> = {
  1: { label: 'Tier 1', color: 'bg-muted-foreground/20 text-muted-foreground' },
  2: { label: 'Tier 2', color: 'bg-primary/15 text-primary' },
  3: { label: 'Tier 3', color: 'bg-violet-500/15 text-violet-400' },
  4: { label: 'Tier 4', color: 'bg-amber/15 text-amber' },
  5: { label: 'Tier 5', color: 'bg-emerald/15 text-emerald' },
}

export default function Accounts() {
  const { toast } = useToast()
  const [tab, setTab] = useState<'accounts' | 'proxies'>('accounts')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showProxyModal, setShowProxyModal] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ accountName: '', naverId: '', naverPassword: '', tier: 1, proxyId: '' })
  const [proxyForm, setProxyForm] = useState({ ip: '', port: '', username: '', password: '' })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [accRes, proxyRes] = await Promise.all([api.get('/accounts'), api.get('/proxies')])
      setAccounts(accRes.data.accounts || [])
      setProxies(proxyRes.data.proxies || [])
    } catch { /* silently fail */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAddAccount = async () => {
    if (!form.accountName || !form.naverId) return toast('error', '계정명과 네이버 ID를 입력하세요.')
    setSaving(true)
    try {
      await api.post('/accounts', form)
      toast('success', '계정이 추가되었습니다.')
      setShowAddModal(false)
      setForm({ accountName: '', naverId: '', naverPassword: '', tier: 1, proxyId: '' })
      fetchData()
    } catch { toast('error', '계정 추가에 실패했습니다.') }
    setSaving(false)
  }

  const openEdit = (acc: Account) => {
    setEditingAccount(acc)
    setForm({
      accountName: acc.accountName,
      naverId: acc.naverId,
      naverPassword: '',
      tier: acc.tier,
      proxyId: acc.proxyId || '',
    })
  }

  const handleEditAccount = async () => {
    if (!editingAccount) return
    setSaving(true)
    try {
      await api.patch(`/accounts/${editingAccount.id}`, form)
      toast('success', '계정이 수정되었습니다.')
      setEditingAccount(null)
      fetchData()
    } catch { toast('error', '수정 실패') }
    setSaving(false)
  }

  const handleToggle = async (id: string, field: string, value: boolean) => {
    try {
      await api.patch(`/accounts/${id}`, { [field]: value })
      fetchData()
    } catch { toast('error', '상태 변경 실패') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('정말로 이 계정을 삭제하시겠습니까?')) return
    try {
      await api.delete(`/accounts/${id}`)
      toast('success', '계정이 삭제되었습니다.')
      fetchData()
    } catch { toast('error', '삭제 실패') }
  }

  const handleAddProxy = async () => {
    if (!proxyForm.ip || !proxyForm.port) return toast('error', 'IP와 포트를 입력하세요.')
    setSaving(true)
    try {
      await api.post('/proxies', proxyForm)
      toast('success', '프록시가 추가되었습니다.')
      setShowProxyModal(false)
      setProxyForm({ ip: '', port: '', username: '', password: '' })
      fetchData()
    } catch { toast('error', '프록시 추가 실패') }
    setSaving(false)
  }

  const handleProxyTest = async (id: string) => {
    try {
      const { data } = await api.post(`/proxies/${id}/test`)
      toast(data.result.status === 'error' ? 'error' : 'success',
        `연결 ${data.result.status} — ${data.result.speed}ms`)
      fetchData()
    } catch { toast('error', '테스트 실패') }
  }

  const handleDeleteProxy = async (id: string) => {
    if (!confirm('프록시를 삭제하시겠습니까?')) return
    try {
      await api.delete(`/proxies/${id}`)
      toast('success', '프록시가 삭제되었습니다.')
      fetchData()
    } catch { toast('error', '삭제 실패') }
  }

  if (loading) return <PageSkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">계정 및 프록시 관리</h1>
          <p className="text-sm text-muted-foreground">Naver 계정과 프록시를 등록하고 안전하게 관리합니다</p>
        </div>
        <button onClick={() => { setForm({ accountName: '', naverId: '', naverPassword: '', tier: 1, proxyId: '' }); setShowAddModal(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          <UserPlus className="w-4 h-4" /> 계정 추가
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
        {(['accounts', 'proxies'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}>
            {t === 'accounts' ? 'Naver 계정' : '프록시 서버'}
          </button>
        ))}
      </div>

      {/* Accounts Tab */}
      {tab === 'accounts' && (
        <div className="glass-panel rounded-xl p-5">
          {accounts.length === 0 ? (
            <EmptyState icon={<UserPlus className="w-16 h-16" />} title="등록된 계정이 없습니다" description="우측 상단 버튼으로 계정을 추가하세요" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {accounts.map((acc) => {
                const tier = tierConfig[acc.tier] || tierConfig[1]
                return (
                  <div key={acc.id} className="group bg-background/40 border border-border rounded-xl p-5 hover:border-primary/30 transition-colors">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                          acc.isActive ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-muted text-muted-foreground border border-border'
                        }`}>
                          {acc.accountName.charAt(0)}
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground leading-tight">{acc.accountName}</h4>
                          <p className="text-xs text-muted-foreground">{acc.naverId}</p>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(acc)} className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(acc.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${tier.color}`}>
                        <Shield className="w-3 h-3 inline mr-0.5" />{tier.label}
                      </span>
                      {acc.proxyServer
                        ? <span className="text-xs text-emerald flex items-center gap-1"><Wifi className="w-3 h-3" />{acc.proxyServer}</span>
                        : <span className="text-xs text-destructive">프록시 미할당</span>}
                    </div>

                    <div className="space-y-2 pt-3 border-t border-border/50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">활성화</span>
                        <Toggle size="sm" enabled={acc.isActive} onToggle={() => handleToggle(acc.id, 'isActive', !acc.isActive)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">자동 발행</span>
                        <Toggle size="sm" enabled={acc.autoPublish} onToggle={() => handleToggle(acc.id, 'autoPublish', !acc.autoPublish)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">이웃 참여</span>
                        <Toggle size="sm" enabled={acc.neighborEngage} onToggle={() => handleToggle(acc.id, 'neighborEngage', !acc.neighborEngage)} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Proxies Tab */}
      {tab === 'proxies' && (
        <div className="glass-panel rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-foreground">프록시 서버 목록</h2>
            <button onClick={() => { setProxyForm({ ip: '', port: '', username: '', password: '' }); setShowProxyModal(true) }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary transition-colors">
              <Plus className="w-4 h-4" /> 프록시 추가
            </button>
          </div>

          {proxies.length === 0 ? (
            <EmptyState icon={<Wifi className="w-16 h-16" />} title="등록된 프록시가 없습니다" />
          ) : (
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
                  {proxies.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.03] transition-colors">
                      <td className="py-3 font-mono text-foreground">{p.ip}:{p.port}</td>
                      <td className="py-3 text-muted-foreground">{p.username || '-'}</td>
                      <td className="py-3"><StatusBadge label={p.status === 'normal' ? '정상' : p.status === 'slow' ? '느림' : '오류'} /></td>
                      <td className="py-3 text-muted-foreground">{p.speed ? `${p.speed}ms` : '-'}</td>
                      <td className="py-3 text-muted-foreground">{p.assignedAccountName || '-'}</td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <button onClick={() => handleProxyTest(p.id)}
                            className="px-2.5 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                            연결 테스트
                          </button>
                          <button onClick={() => handleDeleteProxy(p.id)}
                            className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg p-6 m-4 rounded-2xl relative">
            <button onClick={() => setShowAddModal(false)} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold mb-1">계정 추가</h3>
            <p className="text-sm text-muted-foreground mb-6">계정 정보는 AES256으로 암호화되어 저장됩니다.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">별칭</label>
                <input type="text" value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                  placeholder="예: 블로그마스터" autoComplete="off" className="w-full px-4 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Naver ID</label>
                  <input type="text" value={form.naverId} onChange={(e) => setForm({ ...form, naverId: e.target.value })}
                    autoComplete="off" className="w-full px-4 py-2.5 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">비밀번호</label>
                  <input type="password" value={form.naverPassword} onChange={(e) => setForm({ ...form, naverPassword: e.target.value })}
                    autoComplete="new-password" className="w-full px-4 py-2.5 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:border-primary" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">티어</label>
                  <select value={form.tier} onChange={(e) => setForm({ ...form, tier: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:border-primary appearance-none">
                    {[1, 2, 3, 4, 5].map((t) => <option key={t} value={t}>Tier {t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">프록시</label>
                  <select value={form.proxyId} onChange={(e) => setForm({ ...form, proxyId: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:border-primary appearance-none">
                    <option value="">자동 할당</option>
                    {proxies.map((p) => <option key={p.id} value={p.id}>{p.ip}:{p.port}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={handleAddAccount} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
                저장
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Account Modal */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg p-6 m-4 rounded-2xl relative">
            <button onClick={() => setEditingAccount(null)} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold mb-1">계정 수정</h3>
            <p className="text-sm text-muted-foreground mb-6">비밀번호를 비워두면 기존 값이 유지됩니다.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">별칭</label>
                <input type="text" value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                  autoComplete="off" className="w-full px-4 py-2.5 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:border-primary" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Naver ID</label>
                  <input type="text" value={form.naverId} onChange={(e) => setForm({ ...form, naverId: e.target.value })}
                    autoComplete="off" className="w-full px-4 py-2.5 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">비밀번호 (변경 시만)</label>
                  <input type="password" value={form.naverPassword} onChange={(e) => setForm({ ...form, naverPassword: e.target.value })}
                    placeholder="변경 시에만 입력" autoComplete="new-password" className="w-full px-4 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">티어</label>
                  <select value={form.tier} onChange={(e) => setForm({ ...form, tier: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:border-primary appearance-none">
                    {[1, 2, 3, 4, 5].map((t) => <option key={t} value={t}>Tier {t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">프록시</label>
                  <select value={form.proxyId} onChange={(e) => setForm({ ...form, proxyId: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:border-primary appearance-none">
                    <option value="">없음</option>
                    {proxies.map((p) => <option key={p.id} value={p.id}>{p.ip}:{p.port}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
              <button onClick={() => setEditingAccount(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={handleEditAccount} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
                수정 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Proxy Modal */}
      {showProxyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg p-6 m-4 rounded-2xl relative">
            <button onClick={() => setShowProxyModal(false)} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold mb-1">프록시 추가</h3>
            <p className="text-sm text-muted-foreground mb-6">프록시 서버 정보를 입력하세요.</p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">IP 주소</label>
                  <input type="text" value={proxyForm.ip} onChange={(e) => setProxyForm({ ...proxyForm, ip: e.target.value })}
                    placeholder="예: 103.15.22.41" autoComplete="off" className="w-full px-4 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">포트</label>
                  <input type="text" value={proxyForm.port} onChange={(e) => setProxyForm({ ...proxyForm, port: e.target.value })}
                    placeholder="예: 8080" autoComplete="off" className="w-full px-4 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">사용자명 (선택)</label>
                  <input type="text" value={proxyForm.username} onChange={(e) => setProxyForm({ ...proxyForm, username: e.target.value })}
                    placeholder="username" autoComplete="off" className="w-full px-4 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">비밀번호 (선택)</label>
                  <input type="password" value={proxyForm.password} onChange={(e) => setProxyForm({ ...proxyForm, password: e.target.value })}
                    placeholder="password" autoComplete="new-password" className="w-full px-4 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
              <button onClick={() => setShowProxyModal(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={handleAddProxy} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
