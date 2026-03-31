import { useState, useEffect } from 'react'
import {
  Plus,
  Package,
  Trash2,
  X,
  Loader2,
  Tag,
  Calendar,
  Hash,
} from 'lucide-react'
import api from '../lib/api'

interface Product {
  _id: string
  name: string
  category: string
  priority: string
  description: string
  tags: string[]
  status: 'active' | 'paused' | 'archived'
  handleCount: number
  lastHandledAt: string | null
}

const CATEGORIES = ['finance', 'tech', 'health', 'lifestyle', 'education'] as const
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const

const categoryColors: Record<string, string> = {
  finance: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  tech: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  health: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  lifestyle: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  education: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
}

const priorityColors: Record<string, string> = {
  low: 'bg-gray-500/15 text-gray-400 border-gray-500/20',
  normal: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  high: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  urgent: 'bg-red-500/15 text-red-400 border-red-500/20',
}

const statusConfig: Record<string, { dot: string; label: string }> = {
  active: { dot: 'bg-emerald-400', label: 'Active' },
  paused: { dot: 'bg-amber-400', label: 'Paused' },
  archived: { dot: 'bg-gray-400', label: 'Archived' },
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: '',
    category: 'tech',
    priority: 'normal',
    description: '',
    tags: '',
  })

  const fetchProducts = async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/products')
      setProducts(data)
    } catch (err) {
      console.error('Failed to fetch products', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  const handleAdd = async () => {
    if (!form.name.trim()) return
    try {
      setSaving(true)
      const payload = {
        ...form,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      }
      await api.post('/products', payload)
      setShowModal(false)
      setForm({ name: '', category: 'tech', priority: 'normal', description: '', tags: '' })
      fetchProducts()
    } catch (err) {
      console.error('Failed to add product', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    try {
      await api.delete(`/products/${id}`)
      setProducts((prev) => prev.filter((p) => p._id !== id))
    } catch (err) {
      console.error('Failed to delete product', err)
    }
  }

  return (
    <div className="min-h-screen bg-background p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Product Management</h1>
          <p className="text-muted-foreground mt-1">
            상품을 등록하고 AI 블로그 파이프라인에 연결합니다
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-primary to-secondary text-white font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Add Product
        </button>
      </div>

      {/* Product Grid */}
      <div className="glass-panel rounded-2xl p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Package className="w-12 h-12 mb-4 opacity-40" />
            <p className="text-lg font-medium">등록된 상품이 없습니다</p>
            <p className="text-sm mt-1">Add Product 버튼을 눌러 상품을 추가하세요</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => {
              const status = statusConfig[product.status] ?? statusConfig.active
              return (
                <div
                  key={product._id}
                  className="group relative rounded-xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all"
                >
                  {/* Delete button */}
                  <button
                    onClick={() => handleDelete(product._id)}
                    className="absolute top-3 right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  {/* Name & Badges */}
                  <h3 className="text-lg font-bold text-foreground mb-2 pr-8">
                    {product.name}
                  </h3>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span
                      className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${categoryColors[product.category] ?? categoryColors.tech}`}
                    >
                      {product.category}
                    </span>
                    <span
                      className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${priorityColors[product.priority] ?? priorityColors.normal}`}
                    >
                      {product.priority}
                    </span>
                  </div>

                  {/* Description */}
                  {product.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                      {product.description}
                    </p>
                  )}

                  {/* Footer info */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-3 mt-auto">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                      <span className="flex items-center gap-1">
                        <Hash className="w-3 h-3" />
                        {product.handleCount ?? 0}
                      </span>
                    </div>
                    {product.lastHandledAt && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(product.lastHandledAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Product Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg mx-4 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-foreground">Add Product</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="상품 이름"
                  className="w-full px-4 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                />
              </div>

              {/* Category & Priority */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="상품에 대한 설명을 입력하세요"
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
                />
              </div>

              {/* Tags */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  <Tag className="w-3.5 h-3.5 inline mr-1" />
                  Tags
                </label>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="쉼표로 구분 (예: AI, 블로그, 자동화)"
                  className="w-full px-4 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-5 py-2.5 rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={saving || !form.name.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-primary to-secondary text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
