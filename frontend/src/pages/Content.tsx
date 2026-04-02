import { useState } from 'react'
import {
  Sparkles,
  Copy,
  PenLine,
  ShieldCheck,
  Trash2,
  FileText,
  Clock,
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
const mockQueue: QueueItem[] = [
  { id: 1, keyword: '청년도약계좌', title: '청년도약계좌, 2026년 달라진 점 총정리!', tone: '친근톤', grade: 'A', status: '검수완료' },
  { id: 2, keyword: '신용대출 비교', title: '2026 신용대출 금리 비교, 어디가 유리할까?', tone: '전문톤', grade: 'A', status: '검수완료' },
  { id: 3, keyword: '전세자금대출', title: '전세자금대출 조건 완벽 가이드', tone: '전문톤', grade: 'B', status: '생성중' },
  { id: 4, keyword: '카드 혜택', title: '2026 신용카드 혜택 총정리 리뷰', tone: '리뷰톤', grade: 'C', status: '저품질' },
  { id: 5, keyword: '적금 추천', title: '직장인 적금 추천 TOP 5', tone: '친근톤', grade: 'B', status: '대기' },
]

/* ── Mock generated article ── */
const mockArticle = {
  title: '청년도약계좌, 2026년 달라진 점 총정리!',
  body: `안녕하세요, 오늘은 2026년 청년도약계좌의 변경 사항에 대해 알아보겠습니다.

올해부터 청년도약계좌의 가입 조건이 한층 완화되었는데요. 기존에는 만 19~34세 이하 청년만 가입이 가능했지만, 2026년부터는 만 39세까지 확대 적용됩니다.

## 주요 변경 사항

1. **가입 연령 확대**: 만 39세까지 신청 가능
2. **납입 한도 상향**: 월 최대 100만원까지 납입 가능 (기존 70만원)
3. **정부 기여금 인상**: 소득 구간별 최대 4만원 → 6만원
4. **중도 해지 패널티 완화**: 불가피한 사유 시 이자 감면 없이 해지 가능

## 신청 방법

가까운 은행 영업점 방문 또는 모바일 뱅킹 앱에서 간편하게 신청할 수 있습니다. 필요 서류는 신분증과 소득확인증명서이며, 비대면 신청 시 본인인증만으로 가입이 완료됩니다.

특히 올해는 **비과세 혜택**이 강화되어 이자소득세 면제 한도가 확대되었으니, 아직 가입하지 않으신 분들은 서둘러 확인해 보시기 바랍니다.`,
}

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
  const [keyword, setKeyword] = useState('')
  const [showPreview, setShowPreview] = useState(true)

  const readyCount = mockQueue.filter((q) => q.status === '검수완료').length
  const lowCount = mockQueue.filter((q) => q.status === '저품질').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI 콘텐츠 생성</h1>
          <p className="text-sm text-muted-foreground">
            Claude AI가 키워드 기반으로 블로그 글을 자동 생성합니다
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90 transition-opacity">
          <Sparkles className="w-4 h-4" />
          새 콘텐츠 생성
        </button>
      </div>

      {/* Main Area */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left - Content Generator (60%) */}
        <div className="lg:col-span-3 space-y-4">
          <div className="glass-panel rounded-xl p-5">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              콘텐츠 생성기
            </h2>

            {/* Keyword input */}
            <div className="mb-4">
              <label className="block text-sm text-muted-foreground mb-1.5">키워드</label>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="예: 청년도약계좌 신청방법"
                className="w-full px-4 py-3 rounded-lg bg-input border border-border text-foreground text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
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
            <div className="mb-5">
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

            {/* Generate button */}
            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              AI 글 생성
            </button>
          </div>

          {/* Generated preview */}
          {showPreview && (
            <div className="glass-panel rounded-xl p-5">
              <div className="rounded-lg bg-background/60 border border-border p-5">
                <h3 className="text-lg font-bold text-foreground mb-3">
                  {mockArticle.title}
                </h3>
                <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {mockArticle.body}
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors">
                  <Copy className="w-3.5 h-3.5" />
                  복사
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors">
                  <PenLine className="w-3.5 h-3.5" />
                  편집
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-amber/15 text-muted-foreground hover:text-amber transition-colors">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  저품질 검사
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right - Content Queue (40%) */}
        <div className="lg:col-span-2">
          <div className="glass-panel rounded-xl p-5">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-secondary" />
              콘텐츠 대기열
            </h2>

            <div className="space-y-3">
              {mockQueue.map((item) => (
                <div
                  key={item.id}
                  className="group rounded-lg bg-background/40 border border-border p-3 hover:border-primary/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium mb-1.5 ${toneStyle[item.tone]}`}>
                        {item.keyword}
                      </span>
                      <p className="text-sm font-medium text-foreground truncate">
                        {item.title}
                      </p>
                    </div>
                    <button className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-all shrink-0">
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

            {/* Summary */}
            <div className="mt-4 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground text-center">
                총 <span className="text-foreground font-medium">{mockQueue.length}건</span>
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
