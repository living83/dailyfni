import {
  Search,
  TrendingUp,
  PenTool,
  Image,
  CheckCircle,
  Send,
  Bot,
} from 'lucide-react'

interface AgentDef {
  name: string
  icon: React.ElementType
  color: string
  gradient: string
  description: string
  tools: string[]
  buttonLabel: string
}

const agents: AgentDef[] = [
  {
    name: 'ResearchAgent',
    icon: Search,
    color: 'text-blue-400',
    gradient: 'from-blue-600/80 to-blue-400/60',
    description: '상품 리서치, 블로그 분석, 리뷰 요약',
    tools: ['ProductCrawler', 'BlogAnalyzer', 'ReviewSummarizer'],
    buttonLabel: 'Run Research',
  },
  {
    name: 'SEOAgent',
    icon: TrendingUp,
    color: 'text-emerald-400',
    gradient: 'from-emerald-600/80 to-emerald-400/60',
    description: '키워드 트렌드, 제목 최적화, 태그 추천',
    tools: ['NaverTrend', 'TitleOptimizer', 'TagRecommender'],
    buttonLabel: 'Run SEO',
  },
  {
    name: 'WriterAgent',
    icon: PenTool,
    color: 'text-violet-400',
    gradient: 'from-violet-600/80 to-violet-400/60',
    description: '6파트 콘텐츠, 제휴링크, 톤 스타일링',
    tools: ['ContentTemplate', 'AffiliateLink', 'ToneStyler'],
    buttonLabel: 'Write Article',
  },
  {
    name: 'ImageAgent',
    icon: Image,
    color: 'text-pink-400',
    gradient: 'from-pink-600/80 to-pink-400/60',
    description: '이미지 수집, 썸네일, 인포그래픽',
    tools: ['ImageCollector', 'ThumbnailGenerator', 'InfographicBuilder'],
    buttonLabel: 'Generate Images',
  },
  {
    name: 'ReviewerAgent',
    icon: CheckCircle,
    color: 'text-amber-400',
    gradient: 'from-amber-600/80 to-amber-400/60',
    description: '맞춤법, 팩트체크, 중복 검사',
    tools: ['SpellCheck', 'FactChecker', 'DuplicateChecker'],
    buttonLabel: 'Review Article',
  },
  {
    name: 'PublisherAgent',
    icon: Send,
    color: 'text-emerald-400',
    gradient: 'from-emerald-600/80 to-teal-400/60',
    description: '네이버 발행, 스케줄, 검증',
    tools: ['NaverBlogPublish', 'ScheduleManager', 'PostVerifier'],
    buttonLabel: 'Publish',
  },
]

export default function Agents() {
  const handleAction = (agentName: string) => {
    console.log(`[${agentName}] action triggered`)
    alert(`${agentName} 실행이 요청되었습니다.`)
  }

  return (
    <div className="min-h-screen bg-background p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">AI Agents</h1>
        </div>
        <p className="text-muted-foreground mt-1">
          6개의 전문 AI 에이전트가 블로그 자동화를 수행합니다
        </p>
      </div>

      {/* Agent Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => {
          const Icon = agent.icon
          return (
            <div
              key={agent.name}
              className="glass-panel group rounded-2xl overflow-hidden border border-border hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 transition-all duration-300"
            >
              {/* Gradient Header */}
              <div
                className={`relative bg-gradient-to-br ${agent.gradient} px-6 py-6`}
              >
                <div className="absolute inset-0 bg-black/20" />
                <div className="relative flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-white">{agent.name}</h2>
                </div>
              </div>

              {/* Body */}
              <div className="px-6 py-5">
                <p className="text-sm text-muted-foreground mb-4">
                  {agent.description}
                </p>

                {/* Tool chips */}
                <div className="flex flex-wrap gap-2 mb-5">
                  {agent.tools.map((tool) => (
                    <span
                      key={tool}
                      className="text-xs font-medium px-2.5 py-1 rounded-full bg-muted border border-border text-muted-foreground"
                    >
                      {tool}
                    </span>
                  ))}
                </div>

                {/* Action button */}
                <button
                  onClick={() => handleAction(agent.name)}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-gradient-to-r ${agent.gradient} text-white font-medium hover:opacity-90 transition-opacity`}
                >
                  <Icon className="w-4 h-4" />
                  {agent.buttonLabel}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
