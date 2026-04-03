/* ── User ── */
export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'user' | 'viewer'
}

/* ── Account & Proxy ── */
export interface Account {
  id: string
  accountName: string
  naverId: string
  tier: 1 | 2 | 3 | 4 | 5
  isActive: boolean
  autoPublish: boolean
  neighborEngage: boolean
  proxyId: string | null
  proxyServer: string | null
  createdAt: string
  updatedAt: string
}

export interface Proxy {
  id: string
  ip: string
  port: number
  username: string
  status: 'normal' | 'slow' | 'error'
  speed: number | null
  assignedAccountId: string | null
  assignedAccountName: string | null
}

/* ── Content ── */
export type Tone = '친근톤' | '전문톤' | '리뷰톤'
export type ContentType = '일반 정보성' | '광고(대출)'
export type ContentStatus = '대기' | '생성중' | '검수완료' | '저품질'
export type Grade = 'A' | 'B' | 'C' | 'D'

export interface ContentItem {
  id: string
  keyword: string
  title: string
  body: string
  tone: Tone
  contentType: ContentType
  productInfo: string
  grade: Grade | null
  status: ContentStatus
  createdAt: string
}

/* ── Posting ── */
export type PostingStatus = '대기중' | '발행중' | '발행완료' | '실패'
export type DistributionMode = 'sequential' | 'random' | 'tier'

export interface PostingQueueItem {
  id: string
  keyword: string
  accountName: string
  tone: Tone
  scheduledTime: string
  status: PostingStatus
}

export interface PostingSettings {
  distribution: DistributionMode
  interval: string
  dailyMax: number
  accountMax: number
}

export interface ErrorLogEntry {
  id: string
  timestamp: string
  accountName: string
  message: string
  severity: '정보' | '경고' | '오류'
}

/* ── Monitoring ── */
export interface DashboardStats {
  activeAccounts: number
  todayPosts: number
  todaySuccess: number
  todayFailed: number
  pendingContent: number
  successRate: number
}

export interface AccountPerformance {
  accountName: string
  tier: number
  totalPosts: number
  success: number
  failed: number
  successRate: number
}

export interface TierPosting {
  tier: number
  label: string
  general: number
  ad: number
}

export interface PostingRecord {
  id: string
  date: string
  accountName: string
  keyword: string
  title: string
  tone: Tone
  status: '발행완료' | '저품질' | '실패'
  grade: Grade | null
  url: string | null
}

/* ── Engagement ── */
export interface NeighborPost {
  id: string
  blogName: string
  title: string
  timeAgo: string
  liked: boolean
  commented: boolean
}

export interface EngagementStats {
  todayLikes: number
  todayComments: number
  activeAccounts: number
  totalAccounts: number
}

export interface EngagementActivity {
  id: string
  time: string
  accountName: string
  action: '공감' | '댓글'
  target: string
}

/* ── Settings ── */
export interface SystemSettings {
  claudeApiKey: string
  naverClientId: string
  naverClientSecret: string
  engagementBot: boolean
  engStartHour: string
  engStartMin: string
  maxVisits: number
  heartLike: boolean
  aiComment: boolean
  engagementAccountIds: string[]
  logLevel: string
  logRetention: string
  proxyAutoCheck: boolean
  proxyCheckInterval: string
}
