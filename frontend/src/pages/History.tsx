import { useState } from 'react'
import {
  History as HistoryIcon,
  RefreshCw,
  ExternalLink,
} from 'lucide-react'

interface Article {
  id: number
  date: string
  product: string
  title: string
  tone: '친근톤' | '전문톤' | '리뷰톤'
  grade: string
  score: number
  status: '발행완료' | '검수중' | '생성중' | '실패'
  link: string | null
}

const toneBadge: Record<string, string> = {
  친근톤: 'bg-violet-500/20 text-violet-400',
  전문톤: 'bg-blue-500/20 text-blue-400',
  리뷰톤: 'bg-amber-500/20 text-amber-400',
}

const gradeColor: Record<string, string> = {
  A: 'text-emerald-400',
  B: 'text-blue-400',
  C: 'text-amber-400',
}

const statusStyle: Record<string, string> = {
  발행완료: 'bg-emerald-500/20 text-emerald-400',
  검수중: 'bg-amber-500/20 text-amber-400 animate-pulse',
  생성중: 'bg-blue-500/20 text-blue-400',
  실패: 'bg-destructive/20 text-destructive',
}

const mockData: Article[] = [
  { id: 1, date: '2026-03-31', product: '갤럭시 S24', title: '갤럭시 S24 울트라 실사용 3개월 후기', tone: '리뷰톤', grade: 'A', score: 94, status: '발행완료', link: 'https://blog.example.com/1' },
  { id: 2, date: '2026-03-30', product: '에어팟 프로', title: '에어팟 프로 2세대 vs 갤럭시 버즈 비교', tone: '전문톤', grade: 'A', score: 91, status: '발행완료', link: 'https://blog.example.com/2' },
  { id: 3, date: '2026-03-29', product: '다이슨 에어랩', title: '다이슨 에어랩 멀티 스타일러 완벽 가이드', tone: '친근톤', grade: 'B', score: 85, status: '발행완료', link: 'https://blog.example.com/3' },
  { id: 4, date: '2026-03-28', product: '맥북 프로 M3', title: '맥북 프로 M3 개발자 관점 심층 리뷰', tone: '전문톤', grade: 'A', score: 96, status: '발행완료', link: 'https://blog.example.com/4' },
  { id: 5, date: '2026-03-27', product: 'LG 스탠바이미', title: 'LG 스탠바이미 Go 캠핑용 모니터 추천', tone: '친근톤', grade: 'B', score: 82, status: '발행완료', link: 'https://blog.example.com/5' },
  { id: 6, date: '2026-03-27', product: '로보락 S8', title: '로보락 S8 프로 울트라 로봇청소기 비교', tone: '리뷰톤', grade: 'B', score: 87, status: '검수중', link: null },
  { id: 7, date: '2026-03-26', product: '아이패드 프로', title: '아이패드 프로 M4 학생 필수템 총정리', tone: '친근톤', grade: 'C', score: 74, status: '검수중', link: null },
  { id: 8, date: '2026-03-26', product: '소니 WH-1000XM5', title: '소니 WH-1000XM5 노이즈캔슬링 성능 테스트', tone: '전문톤', grade: 'A', score: 92, status: '실패', link: null },
]

export default function History() {
  const [articles] = useState<Article[]>(mockData)
  const [refreshing, setRefreshing] = useState(false)

  const published = articles.filter((a) => a.status === '발행완료').length
  const pending = articles.filter((a) => a.status === '검수중' || a.status === '생성중').length
  const failed = articles.filter((a) => a.status === '실패').length

  const handleRefresh = () => {
    setRefreshing(true)
    setTimeout(() => setRefreshing(false), 1000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Publish History</h1>
          <p className="text-muted-foreground mt-1">
            생성된 블로그 글과 발행 이력을 조회합니다
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <span>
          Total: <strong className="text-foreground">{articles.length}</strong> articles
        </span>
        <span>
          Published: <strong className="text-emerald-400">{published}</strong>
        </span>
        <span>
          Pending: <strong className="text-amber-400">{pending}</strong>
        </span>
        <span>
          Failed: <strong className="text-destructive">{failed}</strong>
        </span>
      </div>

      {/* Table */}
      {articles.length === 0 ? (
        <div className="glass-panel rounded-2xl p-16 flex flex-col items-center justify-center gap-3">
          <HistoryIcon className="w-12 h-12 text-muted-foreground" />
          <p className="text-muted-foreground">발행 이력이 없습니다</p>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">날짜</th>
                  <th className="px-4 py-3 font-medium">상품</th>
                  <th className="px-4 py-3 font-medium">제목</th>
                  <th className="px-4 py-3 font-medium">톤</th>
                  <th className="px-4 py-3 font-medium">등급</th>
                  <th className="px-4 py-3 font-medium">상태</th>
                  <th className="px-4 py-3 font-medium">링크</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((article) => (
                  <tr
                    key={article.id}
                    className="border-b border-border last:border-0 hover:bg-primary/5 transition-colors"
                  >
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {article.date}
                    </td>
                    <td className="px-4 py-3 text-foreground whitespace-nowrap">
                      {article.product}
                    </td>
                    <td className="px-4 py-3 text-foreground max-w-xs truncate">
                      {article.title}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          toneBadge[article.tone]
                        }`}
                      >
                        {article.tone}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`font-semibold ${gradeColor[article.grade]}`}>
                        {article.grade}
                      </span>
                      <span className="text-muted-foreground ml-1 text-xs">
                        ({article.score})
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          statusStyle[article.status]
                        }`}
                      >
                        {article.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {article.link ? (
                        <a
                          href={article.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
                        >
                          보기
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
