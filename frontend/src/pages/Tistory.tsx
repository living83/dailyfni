import { useState, useEffect, useCallback } from 'react'
import { BookOpen, Plus, Trash2, Edit3, Send, Loader2, Save, ExternalLink } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import api from '../lib/api'
import Toggle from '../components/Toggle'
import { PageSkeleton } from '../components/LoadingSkeleton'

interface TistoryAccount {
  id: string
  accountName: string
  blogName: string
  kakaoId: string
  tier: number
  isActive: boolean
  autoPublish: boolean
  createdAt: string
}

interface TistoryPosting {
  id: string
  keyword: string
  accountName: string
  status: string
  url: string
  error: string
  createdAt: string
}

const statusStyle: Record<string, string> = {
  '발행완료': 'bg-emerald/15 text-emerald',
  '실패': 'bg-rose-500/15 text-rose-400',
  '대기중': 'bg-muted text-muted-foreground',
  '발행중': 'bg-primary/15 text-primary',
}

export default function Tistory() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<TistoryAccount[]>([])
  const [postings, setPostings] = useState<TistoryPosting[]>([])

  // 계정 추가 폼
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ accountName: '', blogName: '', kakaoId: '', kakaoPassword: '' })
  const [saving, setSaving] = useState(false)

  // 편집
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ accountName: '', blogName: '', kakaoId: '', kakaoPassword: '' })

  const fetchData = useCallback(async () => {
    try {
      const [accRes, postRes] = await Promise.all([
        api.get('/tistory/accounts'),
        api.get('/tistory/postings'),
      ])
      if (accRes.data?.accounts) setAccounts(accRes.data.accounts)
      if (postRes.data?.postings) setPostings(postRes.data.postings)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAdd = async () => {
    if (!form.accountName || !form.blogName || !form.kakaoId) {
      return toast('error', '계정명, 블로그명, 카카오 ID는 필수입니다.')
    }
    setSaving(true)
    try {
      await api.post('/tistory/accounts', form)
      toast('success', '티스토리 계정이 추가되었습니다.')
      setForm({ accountName: '', blogName: '', kakaoId: '', kakaoPassword: '' })
      setShowForm(false)
      fetchData()
    } catch { toast('error', '추가 실패') }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/tistory/accounts/${id}`)
      toast('success', '삭제되었습니다.')
      fetchData()
    } catch { toast('error', '삭제 실패') }
  }

  const handleUpdate = async () => {
    if (!editId) return
    setSaving(true)
    try {
      await api.put(`/tistory/accounts/${editId}`, editForm)
      toast('success', '수정되었습니다.')
      setEditId(null)
      fetchData()
    } catch { toast('error', '수정 실패') }
    setSaving(false)
  }

  const handleToggle = async (id: string, field: 'isActive' | 'autoPublish', current: boolean) => {
    try {
      await api.put(`/tistory/accounts/${id}`, { [field]: !current })
      fetchData()
    } catch { toast('error', '변경 실패') }
  }

  if (loading) return <PageSkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">티스토리 관리</h1>
          <p className="text-sm text-muted-foreground">티스토리 블로그 계정 관리 및 포스팅</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium hover:opacity-90 transition-opacity shadow-lg">
          <Plus className="w-4 h-4" />
          계정 추가
        </button>
      </div>

      {/* 계정 추가 폼 */}
      {showForm && (
        <div className="glass-panel rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">새 티스토리 계정</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input type="text" placeholder="계정명 (표시용)" value={form.accountName}
              onChange={e => setForm(p => ({ ...p, accountName: e.target.value }))}
              className="rounded-lg bg-input border border-border px-4 py-2.5 text-foreground text-sm focus:border-primary focus:outline-none" />
            <input type="text" placeholder="블로그명 (xxx.tistory.com의 xxx)" value={form.blogName}
              onChange={e => setForm(p => ({ ...p, blogName: e.target.value }))}
              className="rounded-lg bg-input border border-border px-4 py-2.5 text-foreground text-sm focus:border-primary focus:outline-none" />
            <input type="text" placeholder="카카오 이메일" value={form.kakaoId}
              onChange={e => setForm(p => ({ ...p, kakaoId: e.target.value }))}
              className="rounded-lg bg-input border border-border px-4 py-2.5 text-foreground text-sm focus:border-primary focus:outline-none" />
            <input type="password" placeholder="카카오 비밀번호" value={form.kakaoPassword}
              onChange={e => setForm(p => ({ ...p, kakaoPassword: e.target.value }))}
              className="rounded-lg bg-input border border-border px-4 py-2.5 text-foreground text-sm focus:border-primary focus:outline-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm hover:opacity-90 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              저장
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-border text-muted-foreground text-sm hover:text-foreground">
              취소
            </button>
          </div>
        </div>
      )}

      {/* 계정 목록 + 발행 기록 2:1 분할 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 계정 목록 (2/3) */}
        <div className="glass-panel rounded-xl p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold text-foreground mb-4">티스토리 계정</h2>
          {accounts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>등록된 티스토리 계정이 없습니다.</p>
              <p className="text-xs mt-1">"계정 추가" 버튼으로 시작하세요.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map(acc => (
                <div key={acc.id} className="p-4 rounded-lg border border-border bg-background/40 hover:bg-white/[0.03] transition-colors">
                  {editId === acc.id ? (
                    /* 편집 모드 */
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <input type="text" value={editForm.accountName} onChange={e => setEditForm(p => ({ ...p, accountName: e.target.value }))}
                          placeholder="계정명" className="rounded-lg bg-input border border-border px-3 py-2 text-foreground text-sm focus:border-primary focus:outline-none" />
                        <input type="text" value={editForm.blogName} onChange={e => setEditForm(p => ({ ...p, blogName: e.target.value }))}
                          placeholder="블로그명" className="rounded-lg bg-input border border-border px-3 py-2 text-foreground text-sm focus:border-primary focus:outline-none" />
                        <input type="text" value={editForm.kakaoId} onChange={e => setEditForm(p => ({ ...p, kakaoId: e.target.value }))}
                          placeholder="카카오 ID" className="rounded-lg bg-input border border-border px-3 py-2 text-foreground text-sm focus:border-primary focus:outline-none" />
                        <input type="password" value={editForm.kakaoPassword} onChange={e => setEditForm(p => ({ ...p, kakaoPassword: e.target.value }))}
                          placeholder="비밀번호 (변경 시만)" className="rounded-lg bg-input border border-border px-3 py-2 text-foreground text-sm focus:border-primary focus:outline-none" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleUpdate} disabled={saving} className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs">저장</button>
                        <button onClick={() => setEditId(null)} className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-xs">취소</button>
                      </div>
                    </div>
                  ) : (
                    /* 표시 모드 */
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-foreground">{acc.accountName}</span>
                          <a href={`https://${acc.blogName}.tistory.com`} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline flex items-center gap-1">
                            {acc.blogName}.tistory.com <ExternalLink className="w-3 h-3" />
                          </a>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber/15 text-amber">Tier {acc.tier}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                          <span>카카오: {acc.kakaoId}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center gap-1">
                          <Toggle enabled={acc.isActive} onToggle={() => handleToggle(acc.id, 'isActive', acc.isActive)} size="sm" />
                          <span className="text-[10px] text-muted-foreground">활성</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <Toggle enabled={acc.autoPublish} onToggle={() => handleToggle(acc.id, 'autoPublish', acc.autoPublish)} size="sm" />
                          <span className="text-[10px] text-muted-foreground">자동</span>
                        </div>
                        <button onClick={() => { setEditId(acc.id); setEditForm({ accountName: acc.accountName, blogName: acc.blogName, kakaoId: acc.kakaoId, kakaoPassword: '' }) }}
                          className="p-1.5 rounded-md hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(acc.id)}
                          className="p-1.5 rounded-md hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 최근 발행 기록 (1/3) */}
        <div className="glass-panel rounded-xl p-5 lg:col-span-1">
          <h2 className="text-lg font-semibold text-foreground mb-4">발행 기록</h2>
          {postings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Send className="w-8 h-8 mx-auto mb-2 opacity-30" />
              아직 발행 기록이 없습니다
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {postings.map(p => (
                <div key={p.id} className="p-3 rounded-lg border border-border bg-background/40">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-foreground">{p.accountName}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusStyle[p.status] || 'bg-muted text-muted-foreground'}`}>
                      {p.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{p.keyword}</p>
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline">{p.url}</a>
                  )}
                  {p.error && <p className="text-[10px] text-rose-400">{p.error}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(p.createdAt).toLocaleString('ko-KR')}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
