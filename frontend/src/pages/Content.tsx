import { useState, useEffect, useCallback } from 'react'
import { Sparkles, Trash2, FileText, Clock, Plus, X, Tag, Search, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import api from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import { PageSkeleton } from '../components/LoadingSkeleton'
import type { Tone, ContentType, ContentItem } from '../types'

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
  const { toast } = useToast()

  const [tone, setTone] = useState<Tone>('친근톤')
  const [contentType, setContentType] = useState<ContentType>('일반 정보성')
  const [keywordInput, setKeywordInput] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])
  const [productInfo, setProductInfo] = useState('')
  const [dupChecking, setDupChecking] = useState(false)
  const [dupResult, setDupResult] = useState<any>(null)
  const [queue, setQueue] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const fetchQueue = useCallback(async () => {
    try {
      const { data } = await api.get('/contents')
      setQueue(data.contents || [])
    } catch { /* silent */ }
    setLoading(false)
  }, [])

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
    setSubmitting(true)
    try {
      const { data } = await api.post('/contents', { keywords, tone, contentType, productInfo })
      toast('success', `${data.count}개 키워드가 대기열에 추가되었습니다. AI 생성이 백그라운드에서 진행됩니다.`)
      setKeywords([])
      setProductInfo('')
      fetchQueue()
      // 폴링: AI 생성 진행 상태를 3초마다 갱신 (30초간)
      let polls = 0
      const pollId = setInterval(() => {
        fetchQueue()
        polls++
        if (polls >= 10) clearInterval(pollId)
      }, 3000)
    } catch { toast('error', '등록 실패') }
    setSubmitting(false)
  }

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/contents/${id}`)
      fetchQueue()
    } catch { toast('error', '삭제 실패') }
  }

  const handleDuplicateCheck = async () => {
    if (keywords.length === 0) return toast('error', '키워드를 먼저 입력하세요.')
    setDupChecking(true)
    setDupResult(null)
    try {
      const { data } = await api.post('/contents/check-duplicate', {
        title: keywords.join(' '),
        keywords,
      })
      setDupResult(data)
      if (data.warning) toast('error', data.message)
      else toast('success', data.message)
    } catch { toast('error', '중복 체크 실패') }
    setDupChecking(false)
  }

  const pendingCount = queue.filter((q) => q.status === '대기').length
  const readyCount = queue.filter((q) => q.status === '검수완료').length
  const lowCount = queue.filter((q) => q.status === '저품질').length
  const [generating, setGenerating] = useState(false)

  const handleGenerateAll = async () => {
    if (pendingCount === 0) return toast('info', '대기 중인 콘텐츠가 없습니다.')
    setGenerating(true)
    try {
      const { data } = await api.post('/contents/generate-all', { concurrency: 5 })
      toast('success', data.message || 'AI 생성이 시작되었습니다.')
      let polls = 0
      const pid = window.setInterval(() => { fetchQueue(); polls++; if (polls >= 60) clearInterval(pid) }, 5000)
    } catch { toast('error', 'AI 생성 실패') }
    setGenerating(false)
  }

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

            {/* Buttons */}
            <div className="flex items-center gap-3">
              <button onClick={handleDuplicateCheck} disabled={keywords.length === 0 || dupChecking}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {dupChecking
                  ? <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                  : <Search className="w-4 h-4" />}
                중복 체크
              </button>
              <button onClick={handleSubmit} disabled={keywords.length === 0 || submitting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed">
                {submitting
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Sparkles className="w-4 h-4" />}
                {keywords.length > 0 ? `${keywords.length}개 키워드 대기열에 추가` : '키워드를 입력하세요'}
              </button>
            </div>

            {/* Duplicate Check Result */}
            {dupResult && (
              <div className={`mt-4 p-4 rounded-lg border ${
                dupResult.warning
                  ? 'border-destructive/30 bg-destructive/5'
                  : dupResult.max_similarity >= 50
                    ? 'border-amber/30 bg-amber/5'
                    : 'border-emerald/30 bg-emerald/5'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {dupResult.warning
                    ? <AlertTriangle className="w-4 h-4 text-destructive" />
                    : <CheckCircle2 className="w-4 h-4 text-emerald" />}
                  <span className={`text-sm font-medium ${dupResult.warning ? 'text-destructive' : 'text-emerald'}`}>
                    최대 유사도: {dupResult.max_similarity}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{dupResult.message}</p>

                {dupResult.results && dupResult.results.length > 0 && (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {dupResult.results.slice(0, 5).map((r: any, i: number) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs p-2 rounded bg-background/50">
                        <a href={r.link} target="_blank" rel="noreferrer"
                          className="text-foreground hover:text-primary truncate flex-1">
                          {r.title}
                        </a>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full font-medium ${
                          r.similarity >= 70 ? 'bg-destructive/15 text-destructive'
                          : r.similarity >= 50 ? 'bg-amber/15 text-amber'
                          : 'bg-emerald/15 text-emerald'
                        }`}>
                          {r.similarity}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right — Queue */}
        <div className="lg:col-span-2">
          <div className="glass-panel rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Clock className="w-5 h-5 text-secondary" /> 콘텐츠 대기열
              </h2>
              {pendingCount > 0 && (
                <button onClick={handleGenerateAll} disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90 disabled:opacity-50">
                  {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  대기 {pendingCount}건 일괄 생성
                </button>
              )}
            </div>

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
