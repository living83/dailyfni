import { useState, useEffect, useCallback } from 'react'
import { Heart, MessageSquare, Users, Clock } from 'lucide-react'
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

const defaultStats: Stats = { todayLikes: 0, todayComments: 0, activeAccounts: 0, totalAccounts: 0 }

export default function Engagement() {
  const { toast } = useToast()

  const [feed, setFeed] = useState<FeedPost[]>([])
  const [stats, setStats] = useState<Stats>(defaultStats)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [runningBatch, setRunningBatch] = useState(false)

  /* ── Fetch helpers ── */
  const fetchFeed = useCallback(async () => {
    try {
      const { data } = await api.get('/engagement/feed')
      setFeed(data.feed || [])
    } catch { /* silent */ }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get('/engagement/stats')
      setStats(data.stats || defaultStats)
    } catch { /* silent */ }
  }, [])

  const fetchActivities = useCallback(async () => {
    try {
      const { data } = await api.get('/engagement/activity')
      setActivities(data.activities || [])
    } catch { /* silent */ }
  }, [])

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchFeed(), fetchStats(), fetchActivities()])
    setLoading(false)
  }, [fetchFeed, fetchStats, fetchActivities])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleBatchRun = async () => {
    setRunningBatch(true)
    try {
      const { data } = await api.post('/engagement/run')
      toast('success', data.message || '참여 실행이 시작되었습니다')
      // 폴링: 배치 실행은 수분~수십분 걸릴 수 있음
      let polls = 0
      const pid = window.setInterval(() => {
        fetchAll()
        polls++
        if (polls >= 60) clearInterval(pid) // 5분 폴링
      }, 5000)
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

      {/* Main Area — 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Neighbor Feed */}
        <div className="glass-panel rounded-xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">이웃 포스팅 피드</h2>
          {feed.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-12">
              <p>이웃 포스팅 피드가 없습니다</p>
              <p className="text-xs mt-2 opacity-70">"참여 실행"을 누르면 ThemePost에서 자동으로 수집합니다</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {feed.map((post) => (
                <div
                  key={post.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-bold text-foreground truncate">{post.blogName}</span>
                      {post.timeAgo && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                          <Clock className="w-3 h-3" />
                          {post.timeAgo}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{post.title}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {post.liked && <span className="text-rose-400 text-sm" title="공감 완료">♥</span>}
                    {post.commented && <span className="text-primary text-sm" title="댓글 완료">💬</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Activity Log */}
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
                {activities.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-muted-foreground">
                      참여 활동 기록이 없습니다
                    </td>
                  </tr>
                ) : activities.map((row, i) => (
                  <tr key={i} className="text-foreground hover:bg-card/30">
                    <td className="py-2 text-muted-foreground text-xs">{row.time}</td>
                    <td className="py-2 font-medium text-xs">{row.accountName}</td>
                    <td className="py-2 text-xs">{row.action}</td>
                    <td className="py-2 text-muted-foreground truncate max-w-[180px] text-xs">
                      {row.target}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
