import { useState, useEffect, useCallback } from 'react'
import { Sparkles, Trash2, FileText, Clock, Plus, X, Tag } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import api from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import { PageSkeleton } from '../components/LoadingSkeleton'
import type { Tone, ContentType, ContentItem } from '../types'

/* ── Demo data ── */
const demoQueue: ContentItem[] = [
  { id: '1', keyword: '청년도약계좌', title: '청년도약계좌, 2026년 달라진 점 총정리!', body: '', tone: '친근톤', contentType: '일반 정보성', productInfo: '', grade: 'A', status: '검수완료', createdAt: '' },
  { id: '2', keyword: '신용대출 비교', title: '2026 신용대출 금리 비교, 어디가 유리할까?', body: '', tone: '전문톤', contentType: '광고(대출)', productInfo: '', grade: 'A', status: '검수완료', createdAt: '' },
  { id: '3', keyword: '전세자금대출', title: '전세자금대출 조건 완벽 가이드', body: '', tone: '전문톤', contentType: '광고(대출)', productInfo: '', grade: 'B', status: '생성중', createdAt: '' },
  { id: '4', keyword: '카드 혜택', title: '2026 신용카드 혜택 총정리 리뷰', body: '', tone: '리뷰톤', contentType: '일반 정보성', productInfo: '', grade: 'C', status: '저품질', createdAt: '' },
  { id: '5', keyword: '적금 추천', title: '직장인 적금 추천 TOP 5', body: '', tone: '친근톤', contentType: '일반 정보성', productInfo: '', grade: null, status: '대기', createdAt: '' },
]

/* ── Radio ── */
function Radio({ name, value, label, checked, onChange }: {
  name: string; value: string; label: string; checked: boolean; onChange: (v: string) => void
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
        checked ? 'border-primary bg-primary' : 'border-muted-foreground/40 group-hover:border-primary/60'
      }`}>
        {checked && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
      </span>
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onChange(value)} className="sr-only" />
      <span className={`text-sm ${checked ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{label}</span>
    </label>
  )
}

export default function Content() {
  const { isDemo } = useAuth()
  const { toast } = useToast()

  const [tone, setTone] = useState<Tone>('친근톤')
  const [contentType, setContentType] = useState<ContentType>('일반 정보성')
  const [keywordInput, setKeywordInput] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])
  const [productInfo, setProductInfo] = useState('')
  const [queue, setQueue] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const fetchQueue = useCallback(async () => {
    if (isDemo) { setQueue(demoQueue); setLoading(false); return }
    try {
      const { data } = await api.get('/contents')
      setQueue(data.contents || [])
    } catch { /* silent */ }
    setLoading(false)
  }, [isDemo])

  useEffect(() => { fetchQueue() }, [fetchQueue])

  const addKeywords = (raw: string) => {
    const newKws = raw.split(',').map((k) => k.trim()).filter((k) => k && !keywords.includes(k))
    if (newKws.length) setKeywords([...keywords, ...newKws])
    setKeywordInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addKeywords(keywordInput) }
  }

  const handleSubmit = async () => {
    if (keywords.length === 0) return
    if (isDemo) {
      const newItems = keywords.map((kw, i) => ({
        id: `demo-${Date.now()}-${i}`, keyword: kw, title: `${kw} 관련 블로그 글`,
        body: '', tone, contentType, productInfo, grade: null, status: '대기' as const, createdAt: new Date().toISOString(),
      }))
      setQueue([...newItems, ...queue])
      setKeywords([])
      setProductInfo('')
      toast('success', `${newItems.length}개 키워드가 대기열에 추가되었습니다.`)
      return
    }
    setSubmitting(true)
    try {
      const { data } = await api.post('/contents', { keywords, tone, contentType, productInfo })
      toast('success', `${data.count}개 키워드가 대기열에 추가되었습니다.`)
      setKeywords([])
      setProductInfo('')
      fetchQueue()
    } catch { toast('error', '등록 실패') }
    setSubmitting(false)
  }

  const handleDelete = async (id: string) => {
    if (isDemo) { setQueue(queue.filter((q) => q.id !== id)); return }
    try {
      await api.delete(`/contents/${id}`)
      fetchQueue()
    } catch { toast('error', '삭제 실패') }
  }

  const readyCount = queue.filter((q) => q.status === '검수완료').length
  const lowCount = queue.filter((q) => q.status === '저품질').length

  if (loading) return <PageSkeleton />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">콘텐츠 생성</h1>
          <p className="text-sm text-muted-foreground">키워드를 등록하면 Claude AI가 블로그 글을 자동 생성합니다</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left — Keyword input */}
        <div className="lg:col-span-3">
          <div className="glass-panel rounded-xl p-5">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> 키워드 등록
            </h2>

            {/* Keyword input */}
            <div className="mb-4">
              <label className="block text-sm text-muted-foreground mb-1.5">
                키워드 <span className="ml-2 text-xs opacity-60">쉼표(,) 또는 Enter로 여러 개 등록</span>
              </label>
              <div className="flex gap-2">
                <input type="text" value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={() => { if (keywordInput.trim()) addKeywords(keywordInput) }}
                  placeholder="예: 청년도약계좌, 신용대출 비교, 전세자금대출"
                  className="flex-1 px-4 py-3 rounded-lg bg-input border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <button onClick={() => addKeywords(keywordInput)}
                  className="px-4 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shrink-0">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {keywords.map((kw) => (
                    <span key={kw} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-medium border border-primary/20">
                      <Tag className="w-3 h-3" />{kw}
                      <button onClick={() => setKeywords(keywords.filter((k) => k !== kw))} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                  <span className="text-xs text-muted-foreground self-center ml-1">총 {keywords.length}개</span>
                </div>
              )}
            </div>

            {/* Tone */}
            <div className="mb-4">
              <label className="block text-sm text-muted-foreground mb-2">톤 선택</label>
              <div className="flex gap-4">
                {(['친근톤', '전문톤', '리뷰톤'] as Tone[]).map((t) => (
                  <Radio key={t} name="tone" value={t} label={t} checked={tone === t} onChange={(v) => setTone(v as Tone)} />
                ))}
              </div>
            </div>

            {/* Content type */}
            <div className="mb-4">
              <label className="block text-sm text-muted-foreground mb-2">콘텐츠 유형</label>
              <div className="flex gap-4">
                {(['일반 정보성', '광고(대출)'] as ContentType[]).map((ct) => (
                  <Radio key={ct} name="ct" value={ct} label={ct} checked={contentType === ct} onChange={(v) => setContentType(v as ContentType)} />
                ))}
              </div>
            </div>

            {/* Product info (ad only) */}
            {contentType === '광고(대출)' && (
              <div className="mb-5">
                <label className="block text-sm text-muted-foreground mb-1.5">
                  상품 설명 / 광고 가이드라인 <span className="ml-2 text-xs opacity-60">AI가 글 작성 시 반드시 포함할 내용</span>
                </label>
                <textarea value={productInfo} onChange={(e) => setProductInfo(e.target.value)}
                  placeholder={`광고할 상품의 정보, 장점, 스펙 등을 입력하세요.\n\n예시:\n- 상품명: ABC 신용대출\n- 금리: 연 4.5%~8.9%\n- 한도: 최대 1억원\n- 강조할 점: 업계 최저 금리, 비대면 신청`}
                  className="w-full min-h-[140px] px-4 py-3 rounded-lg bg-input border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y leading-relaxed" />
              </div>
            )}

            {/* Submit */}
            <button onClick={handleSubmit} disabled={keywords.length === 0 || submitting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
              {submitting
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Sparkles className="w-4 h-4" />}
              {keywords.length > 0 ? `${keywords.length}개 키워드 대기열에 추가` : '키워드를 입력하세요'}
            </button>
          </div>
        </div>

        {/* Right — Queue */}
        <div className="lg:col-span-2">
          <div className="glass-panel rounded-xl p-5">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-secondary" /> 콘텐츠 대기열
            </h2>

            {queue.length === 0 ? (
              <EmptyState icon={<FileText className="w-12 h-12" />} title="대기 중인 콘텐츠가 없습니다" />
            ) : (
              <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                {queue.map((item) => (
                  <div key={item.id} className="group rounded-lg bg-background/40 border border-border p-3 hover:border-primary/20 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <StatusBadge label={item.keyword} />
                          {item.contentType === '광고(대출)' && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-destructive/15 text-destructive">AD</span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                      </div>
                      <button onClick={() => handleDelete(item.id)}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-all shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge label={item.tone} />
                      {item.grade && <StatusBadge label={item.grade} />}
                      <StatusBadge label={item.status} className="ml-auto" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground text-center">
                총 <span className="text-foreground font-medium">{queue.length}건</span>
                {' | '}발행 가능 <span className="text-emerald font-medium">{readyCount}건</span>
                {' | '}저품질 <span className="text-destructive font-medium">{lowCount}건</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
