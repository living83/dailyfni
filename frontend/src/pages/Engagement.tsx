import { useState, useEffect, useCallback } from 'react'
import { Heart, MessageSquare, Users, Play, Clock, RefreshCw, Edit3 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import api from '../lib/api'
import { PageSkeleton } from '../components/LoadingSkeleton'

/* ── Types ── */
interface FeedPost {
  id: string
  blogName: string
  title: string
  timeAgo: string
  liked: boolean
  commented: boolean
}

interface Stats {
  todayLikes: number
  todayComments: number
  activeAccounts: number
  totalAccounts: number
}

interface Activity {
  time: string
  accountName: string
  action: string
  target: string
}

/* ── Demo fallback data ── */
const demoFeed: FeedPost[] = [
  { id: '1', blogName: '여행매니아', title: '제주도 3박4일 가성비 여행 코스 추천', timeAgo: '32분 전', liked: true, commented: true },
  { id: '2', blogName: '맛집탐험가', title: '강남역 숨은 맛집 TOP 5', timeAgo: '1시간 전', liked: true, commented: false },
  { id: '3', blogName: 'IT트렌드', title: '2026년 AI 트렌드 총정리', timeAgo: '2시간 전', liked: false, commented: false },
  { id: '4', blogName: '재테크초보', title: '월 100만원 저축하는 방법', timeAgo: '3시간 전', liked: true, commented: true },
  { id: '5', blogName: '인테리어팁', title: '10평 원룸 넓어 보이는 인테리어', timeAgo: '4시간 전', liked: false, commented: false },
  { id: '6', blogName: '건강생활', title: '아침 루틴으로 하루를 바꾸는 법', timeAgo: '5시간 전', liked: true, commented: false },
]

const demoStats: Stats = { todayLikes: 47, todayComments: 23, activeAccounts: 8, totalAccounts: 12 }

const demoActivities: Activity[] = [
  { time: '10:32', accountName: '블로그마스터', action: '♥ 공감', target: '제주도 3박4일...' },
  { time: '10:30', accountName: '블로그마스터', action: '💬 댓글', target: '강남역 숨은 맛집...' },
  { time: '10:28', accountName: '대출전문블로그', action: '♥ 공감', target: 'AI 트렌드 총정리' },
  { time: '10:25', accountName: '재테크블로그', action: '♥ 공감', target: '월 100만원 저축...' },
  { time: '10:22', accountName: '재테크블로그', action: '💬 댓글', target: '원룸 인테리어...' },
]

export default function Engagement() {
  const { isDemo } = useAuth()
  const { toast } = useToast()

  const [feed, setFeed] = useState<FeedPost[]>([])
  const [stats, setStats] = useState<Stats>(demoStats)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  // AI comment preview state
  const [previewPost, setPreviewPost] = useState<FeedPost | null>(null)
  const [previewComment, setPreviewComment] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [runningBatch, setRunningBatch] = useState(false)

  /* ── Fetch helpers ── */
  const fetchFeed = useCallback(async () => {
    if (isDemo) { setFeed(demoFeed); return }
    try {
      const { data } = await api.get('/engagement/feed')
      setFeed(data.feed || [])
    } catch { /* silent */ }
  }, [isDemo])

  const fetchStats = useCallback(async () => {
    if (isDemo) { setStats(demoStats); return }
    try {
      const { data } = await api.get('/engagement/stats')
      setStats(data.stats || demoStats)
    } catch { /* silent */ }
  }, [isDemo])

  const fetchActivities = useCallback(async () => {
    if (isDemo) { setActivities(demoActivities); return }
    try {
      const { data } = await api.get('/engagement/activity')
      setActivities(data.activities || [])
    } catch { /* silent */ }
  }, [isDemo])

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchFeed(), fetchStats(), fetchActivities()])
    setLoading(false)
  }, [fetchFeed, fetchStats, fetchActivities])

  useEffect(() => { fetchAll() }, [fetchAll])

  /* ── Actions ── */
  const handleLike = async (post: FeedPost) => {
    if (isDemo) {
      setFeed((prev) => prev.map((p) => p.id === post.id ? { ...p, liked: !p.liked } : p))
      toast('success', `${post.blogName} 공감 완료`)
      return
    }
    try {
      await api.post(`/engagement/like/${post.id}`)
      toast('success', `${post.blogName} 공감 완료`)
      fetchFeed()
      fetchStats()
    } catch { toast('error', '공감 실패') }
  }

  const handleCommentPreview = async (post: FeedPost) => {
    setPreviewPost(post)
    setPreviewLoading(true)
    if (isDemo) {
      setPreviewComment(`와 정말 알찬 내용이네요! "${post.title}" 관련해서 저도 관심이 많았는데, 덕분에 좋은 정보 얻어갑니다 😊`)
      setPreviewLoading(false)
      return
    }
    try {
      const { data } = await api.post('/engagement/comment/preview', { postTitle: post.title })
      setPreviewComment(data.comment || '')
    } catch { toast('error', '댓글 생성 실패') }
    setPreviewLoading(false)
  }

  const handleRegenerate = async () => {
    if (!previewPost) return
    await handleCommentPreview(previewPost)
  }

  const handleSubmitComment = async () => {
    if (!previewPost || !previewComment) return
    setCommentSubmitting(true)
    if (isDemo) {
      setFeed((prev) => prev.map((p) => p.id === previewPost.id ? { ...p, commented: true } : p))
      toast('success', '댓글이 게시되었습니다')
      setPreviewPost(null)
      setPreviewComment('')
      setCommentSubmitting(false)
      return
    }
    try {
      await api.post(`/engagement/comment/${previewPost.id}`, { comment: previewComment })
      toast('success', '댓글이 게시되었습니다')
      setPreviewPost(null)
      setPreviewComment('')
      fetchFeed()
      fetchStats()
      fetchActivities()
    } catch { toast('error', '댓글 게시 실패') }
    setCommentSubmitting(false)
  }

  const handleBatchRun = async () => {
    setRunningBatch(true)
    if (isDemo) {
      setFeed((prev) => prev.map((p) => ({ ...p, liked: true, commented: true })))
      setStats({ ...stats, todayLikes: stats.todayLikes + 3, todayComments: stats.todayComments + 4 })
      toast('success', '공감 3건, 댓글 4건 완료')
      setRunningBatch(false)
      return
    }
    try {
      const { data } = await api.post('/engagement/run')
      toast('success', data.message || '참여 실행 완료')
      fetchAll()
    } catch { toast('error', '참여 실행 실패') }
    setRunningBatch(false)
  }

  if (loading) return <PageSkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">이웃참여 관리</h1>
          <p className="text-sm text-muted-foreground">
            이웃 블로그 하트 공감과 AI 자동 댓글로 소통을 강화합니다
          </p>
        </div>
        <button
          onClick={handleBatchRun}
          disabled={runningBatch}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-primary to-secondary text-white font-medium hover:opacity-90 transition-opacity shadow-lg shadow-primary/25 disabled:opacity-50"
        >
          {runningBatch
            ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <Heart className="w-4 h-4" />}
          참여 실행
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-panel rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">오늘 공감</span>
            <Heart className="w-5 h-5 text-rose-400" />
          </div>
          <p className="text-3xl font-bold text-foreground">{stats.todayLikes}</p>
          <p className="text-xs text-muted-foreground mt-1">하트 공감 완료</p>
        </div>

        <div className="glass-panel rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">오늘 댓글</span>
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <p className="text-3xl font-bold text-foreground">{stats.todayComments}</p>
          <p className="text-xs text-muted-foreground mt-1">AI 댓글 작성</p>
        </div>

        <div className="glass-panel rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">참여 계정</span>
            <Users className="w-5 h-5 text-emerald" />
          </div>
          <p className="text-3xl font-bold text-foreground">{stats.activeAccounts}/{stats.totalAccounts}</p>
          <p className="text-xs text-muted-foreground mt-1">활성 계정</p>
        </div>
      </div>

      {/* Main Area */}
      <div className="grid grid-cols-1 lg:grid-cols-[55%_45%] gap-4">
        {/* Left: Neighbor Feed */}
        <div className="glass-panel rounded-xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">이웃 포스팅 피드</h2>
          <div className="space-y-3">
            {feed.map((post) => (
              <div
                key={post.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card/50 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-bold text-foreground">{post.blogName}</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {post.timeAgo}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{post.title}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Status indicators */}
                  {post.liked && (
                    <span className="text-rose-400 text-sm" title="공감 완료">♥</span>
                  )}
                  {post.commented && (
                    <span className="text-primary text-sm" title="댓글 완료">💬</span>
                  )}

                  {/* Action buttons */}
                  <button
                    onClick={() => handleLike(post)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      post.liked
                        ? 'border-rose-400/30 bg-rose-400/10 text-rose-400 cursor-default'
                        : 'border-rose-400/40 text-rose-400 hover:bg-rose-400/10'
                    }`}
                    disabled={post.liked}
                  >
                    ♥ 공감
                  </button>
                  <button
                    onClick={() => handleCommentPreview(post)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      post.commented
                        ? 'border-primary/30 bg-primary/10 text-primary cursor-default'
                        : 'border-primary/40 text-primary hover:bg-primary/10'
                    }`}
                    disabled={post.commented}
                  >
                    💬 댓글
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* AI Comment Preview */}
          <div className="glass-panel rounded-xl p-5">
            <h2 className="text-lg font-semibold text-foreground mb-4">AI 댓글 미리보기</h2>

            <div className="space-y-3">
              <div>
                <span className="text-xs text-muted-foreground">대상 포스트</span>
                <p className="text-sm font-medium text-foreground mt-0.5">
                  {previewPost ? previewPost.title : '제주도 3박4일 가성비 여행 코스 추천'}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-card/50 p-3">
                {previewLoading ? (
                  <div className="flex items-center gap-2 py-2">
                    <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <span className="text-sm text-muted-foreground">AI 댓글 생성 중...</span>
                  </div>
                ) : (
                  <p className="text-sm text-foreground leading-relaxed">
                    {previewComment || '와 정말 알찬 여행 코스네요! 특히 서귀포 올레길 구간은 저도 꼭 가보고 싶었는데, 덕분에 좋은 정보 얻어갑니다 😊 다음에 제주 가면 참고할게요!'}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSubmitComment}
                  disabled={!previewPost || previewLoading || commentSubmitting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {commentSubmitting
                    ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Play className="w-3.5 h-3.5" />}
                  승인 후 게시
                </button>
                <button
                  onClick={handleRegenerate}
                  disabled={!previewPost || previewLoading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-muted-foreground text-sm hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  재생성
                </button>
                <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-muted-foreground text-sm hover:text-foreground hover:border-foreground/30 transition-colors">
                  <Edit3 className="w-3.5 h-3.5" />
                  수정
                </button>
              </div>

              <p className="text-xs text-muted-foreground">
                Claude AI가 포스팅 내용을 분석하여 생성한 댓글입니다
              </p>
            </div>
          </div>

          {/* Activity Log */}
          <div className="glass-panel rounded-xl p-5">
            <h2 className="text-lg font-semibold text-foreground mb-4">참여 활동 기록</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="pb-2 font-medium">시간</th>
                    <th className="pb-2 font-medium">계정</th>
                    <th className="pb-2 font-medium">활동</th>
                    <th className="pb-2 font-medium">대상</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(activities.length > 0 ? activities : demoActivities).map((row, i) => (
                    <tr key={i} className="text-foreground">
                      <td className="py-2 text-muted-foreground">{row.time}</td>
                      <td className="py-2 font-medium">{row.accountName}</td>
                      <td className="py-2">{row.action}</td>
                      <td className="py-2 text-muted-foreground truncate max-w-[140px]">
                        {row.target}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-center">
              <button className="text-xs text-primary hover:text-secondary transition-colors">
                전체 기록 보기 &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
