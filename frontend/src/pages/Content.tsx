import { useState } from 'react'
import {
  Sparkles,
  Trash2,
  FileText,
  Clock,
  Plus,
  X,
  Tag,
} from 'lucide-react'

/* ── Types ── */
type Tone = '친근톤' | '전문톤' | '리뷰톤'
type ContentType = '일반 정보성' | '광고(대출)'
type QueueStatus = '검수완료' | '생성중' | '저품질' | '대기'
type Grade = 'A' | 'B' | 'C'

interface QueueItem {
  id: number
  keyword: string
  title: string
  tone: Tone
  type: ContentType
  grade: Grade
  status: QueueStatus
}

/* ── Status config ── */
const statusStyle: Record<QueueStatus, string> = {
  '검수완료': 'bg-emerald/15 text-emerald',
  '생성중': 'bg-primary/15 text-primary animate-pulse',
  '저품질': 'bg-destructive/15 text-destructive',
  '대기': 'bg-muted text-muted-foreground',
}

const toneStyle: Record<Tone, string> = {
  '친근톤': 'bg-emerald/15 text-emerald',
  '전문톤': 'bg-primary/15 text-primary',
  '리뷰톤': 'bg-amber/15 text-amber',
}

const gradeStyle: Record<Grade, string> = {
  A: 'bg-emerald/15 text-emerald',
  B: 'bg-amber/15 text-amber',
  C: 'bg-destructive/15 text-destructive',
}

/* ── Mock queue data ── */
const initialQueue: QueueItem[] = [
  { id: 1, keyword: '청년도약계좌', title: '청년도약계좌, 2026년 달라진 점 총정리!', tone: '친근톤', type: '일반 정보성', grade: 'A', status: '검수완료' },
  { id: 2, keyword: '신용대출 비교', title: '2026 신용대출 금리 비교, 어디가 유리할까?', tone: '전문톤', type: '광고(대출)', grade: 'A', status: '검수완료' },
  { id: 3, keyword: '전세자금대출', title: '전세자금대출 조건 완벽 가이드', tone: '전문톤', type: '광고(대출)', grade: 'B', status: '생성중' },
  { id: 4, keyword: '카드 혜택', title: '2026 신용카드 혜택 총정리 리뷰', tone: '리뷰톤', type: '일반 정보성', grade: 'C', status: '저품질' },
  { id: 5, keyword: '적금 추천', title: '직장인 적금 추천 TOP 5', tone: '친근톤', type: '일반 정보성', grade: 'B', status: '대기' },
]

/* ── Radio Button ── */
function RadioOption({
  name,
  value,
  label,
  checked,
  onChange,
}: {
  name: string
  value: string
  label: string
  checked: boolean
  onChange: (v: string) => void
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <span
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
          checked ? 'border-primary bg-primary' : 'border-muted-foreground/40 group-hover:border-primary/60'
        }`}
      >
        {checked && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
      </span>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      <span className={`text-sm ${checked ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
        {label}
      </span>
    </label>
  )
}

/* ── Main Page ── */
export default function Content() {
  const [tone, setTone] = useState<Tone>('친근톤')
  const [contentType, setContentType] = useState<ContentType>('일반 정보성')
  const [keywordInput, setKeywordInput] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])
  const [productInfo, setProductInfo] = useState('')
  const [queue, setQueue] = useState<QueueItem[]>(initialQueue)

  const readyCount = queue.filter((q) => q.status === '검수완료').length
  const lowCount = queue.filter((q) => q.status === '저품질').length

  const handleKeywordInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addKeywords(keywordInput)
    }
  }

  const addKeywords = (raw: string) => {
    const newKws = raw
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0 && !keywords.includes(k))
    if (newKws.length > 0) {
      setKeywords([...keywords, ...newKws])
    }
    setKeywordInput('')
  }

  const removeKeyword = (kw: string) => {
    setKeywords(keywords.filter((k) => k !== kw))
  }

  const handleAddToQueue = () => {
    if (keywords.length === 0) return

    const newItems: QueueItem[] = keywords.map((kw, i) => ({
      id: Date.now() + i,
      keyword: kw,
      title: `${kw} 관련 블로그 글`,
      tone,
      type: contentType,
      grade: 'B' as Grade,
      status: '대기' as QueueStatus,
    }))

    setQueue([...newItems, ...queue])
    setKeywords([])
    setProductInfo('')
  }

  const removeFromQueue = (id: number) => {
    setQueue(queue.filter((q) => q.id !== id))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">콘텐츠 생성</h1>
          <p className="text-sm text-muted-foreground">
            키워드를 등록하면 Claude AI가 블로그 글을 자동 생성합니다
          </p>
        </div>
      </div>

      {/* Main Area */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left - Content Generator (60%) */}
        <div className="lg:col-span-3">
          <div className="glass-panel rounded-xl p-5">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              키워드 등록
            </h2>

            {/* Keyword input with tags */}
            <div className="mb-4">
              <label className="block text-sm text-muted-foreground mb-1.5">
                키워드
                <span className="ml-2 text-xs opacity-60">쉼표(,) 또는 Enter로 여러 개 등록</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={handleKeywordInput}
                  onBlur={() => { if (keywordInput.trim()) addKeywords(keywordInput) }}
                  placeholder="예: 청년도약계좌, 신용대출 비교, 전세자금대출"
                  className="flex-1 px-4 py-3 rounded-lg bg-input border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  onClick={() => addKeywords(keywordInput)}
                  className="px-4 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Keyword tags */}
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {keywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-medium border border-primary/20"
                    >
                      <Tag className="w-3 h-3" />
                      {kw}
                      <button
                        onClick={() => removeKeyword(kw)}
                        className="hover:text-destructive transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <span className="text-xs text-muted-foreground self-center ml-1">
                    총 {keywords.length}개
                  </span>
                </div>
              )}
            </div>

            {/* Tone selection */}
            <div className="mb-4">
              <label className="block text-sm text-muted-foreground mb-2">톤 선택</label>
              <div className="flex gap-4">
                {(['친근톤', '전문톤', '리뷰톤'] as Tone[]).map((t) => (
                  <RadioOption
                    key={t}
                    name="tone"
                    value={t}
                    label={t}
                    checked={tone === t}
                    onChange={(v) => setTone(v as Tone)}
                  />
                ))}
              </div>
            </div>

            {/* Content type */}
            <div className="mb-4">
              <label className="block text-sm text-muted-foreground mb-2">콘텐츠 유형</label>
              <div className="flex gap-4">
                {(['일반 정보성', '광고(대출)'] as ContentType[]).map((ct) => (
                  <RadioOption
                    key={ct}
                    name="contentType"
                    value={ct}
                    label={ct}
                    checked={contentType === ct}
                    onChange={(v) => setContentType(v as ContentType)}
                  />
                ))}
              </div>
            </div>

            {/* Product info for ad type */}
            {contentType === '광고(대출)' && (
              <div className="mb-5 animate-in fade-in slide-in-from-top-2 duration-200">
                <label className="block text-sm text-muted-foreground mb-1.5">
                  상품 설명 / 광고 가이드라인
                  <span className="ml-2 text-xs opacity-60">AI가 글 작성 시 반드시 포함할 내용</span>
                </label>
                <textarea
                  value={productInfo}
                  onChange={(e) => setProductInfo(e.target.value)}
                  placeholder={`광고할 상품의 정보, 장점, 스펙 등을 입력하세요.\n\n예시:\n- 상품명: ABC 신용대출\n- 금리: 연 4.5%~8.9%\n- 한도: 최대 1억원\n- 특징: 직장인 우대, 당일 심사, 중도상환 수수료 없음\n- 강조할 점: 업계 최저 금리, 간편 비대면 신청`}
                  className="w-full min-h-[160px] px-4 py-3 rounded-lg bg-input border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y leading-relaxed"
                />
              </div>
            )}

            {/* Add to queue button */}
            <button
              onClick={handleAddToQueue}
              disabled={keywords.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4" />
              {keywords.length > 0
                ? `${keywords.length}개 키워드 대기열에 추가`
                : '키워드를 입력하세요'}
            </button>
          </div>
        </div>

        {/* Right - Content Queue (40%) */}
        <div className="lg:col-span-2">
          <div className="glass-panel rounded-xl p-5">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-secondary" />
              콘텐츠 대기열
            </h2>

            {queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm">대기 중인 콘텐츠가 없습니다</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                {queue.map((item) => (
                  <div
                    key={item.id}
                    className="group rounded-lg bg-background/40 border border-border p-3 hover:border-primary/20 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${toneStyle[item.tone]}`}>
                            {item.keyword}
                          </span>
                          {item.type === '광고(대출)' && (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-destructive/15 text-destructive">
                              AD
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-foreground truncate">
                          {item.title}
                        </p>
                      </div>
                      <button
                        onClick={() => removeFromQueue(item.id)}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-all shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${toneStyle[item.tone]}`}>
                        {item.tone}
                      </span>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${gradeStyle[item.grade]}`}>
                        {item.grade}
                      </span>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ml-auto ${statusStyle[item.status]}`}>
                        {item.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Summary */}
            <div className="mt-4 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground text-center">
                총 <span className="text-foreground font-medium">{queue.length}건</span>
                {' | '}
                발행 가능 <span className="text-emerald font-medium">{readyCount}건</span>
                {' | '}
                저품질 <span className="text-destructive font-medium">{lowCount}건</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
