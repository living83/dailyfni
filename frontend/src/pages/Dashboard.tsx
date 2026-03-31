import { useState, useEffect } from 'react'
import { Package, Bot, FileText, Workflow } from 'lucide-react'
import api from '../lib/api'

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
}

function StatCard({ title, value, icon }: StatCardProps) {
  return (
    <div className="glass-panel rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">{title}</span>
        {icon}
      </div>
      <p className="text-3xl font-bold text-foreground">{value}</p>
    </div>
  )
}

const recentActivity = [
  { agent: 'ResearchAgent', task: 'Market analysis for tech sector', status: 'success' as const, time: '2 min ago' },
  { agent: 'SEOAgent', task: 'Keyword optimization pass', status: 'success' as const, time: '5 min ago' },
  { agent: 'WriterAgent', task: 'Draft article: AI trends 2026', status: 'running' as const, time: '8 min ago' },
  { agent: 'ReviewerAgent', task: 'Quality review batch #42', status: 'pending' as const, time: '12 min ago' },
  { agent: 'PublisherAgent', task: 'Schedule posts for tomorrow', status: 'pending' as const, time: '15 min ago' },
]

const agents = [
  { name: 'ResearchAgent', status: 'Ready', color: 'bg-emerald' },
  { name: 'SEOAgent', status: 'Ready', color: 'bg-emerald' },
  { name: 'WriterAgent', status: 'Ready', color: 'bg-amber' },
  { name: 'ImageAgent', status: 'Idle', color: 'bg-muted-foreground' },
  { name: 'ReviewerAgent', status: 'Idle', color: 'bg-muted-foreground' },
  { name: 'PublisherAgent', status: 'Ready', color: 'bg-emerald' },
]

const statusBadge = {
  success: 'bg-emerald/15 text-emerald',
  running: 'bg-amber/15 text-amber animate-pulse',
  pending: 'bg-muted text-muted-foreground',
} as const

export default function Dashboard() {
  const [productCount, setProductCount] = useState<number>(0)

  useEffect(() => {
    api.get('/products')
      .then(({ data }) => {
        const count = Array.isArray(data) ? data.length : data.count ?? 0
        setProductCount(count)
      })
      .catch(() => setProductCount(0))
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Overview Dashboard</h1>
          <p className="text-sm text-muted-foreground">Real-time status</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald" />
          </span>
          System Active
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Products"
          value={productCount}
          icon={<Package className="w-5 h-5 text-primary" />}
        />
        <StatCard
          title="Active Agents"
          value={6}
          icon={<Bot className="w-5 h-5 text-secondary" />}
        />
        <StatCard
          title="Today's Articles"
          value={12}
          icon={<FileText className="w-5 h-5 text-emerald" />}
        />
        <StatCard
          title="Pipeline Runs"
          value={38}
          icon={<Workflow className="w-5 h-5 text-amber" />}
        />
      </div>

      {/* Bottom section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Activity */}
        <div className="lg:col-span-2 glass-panel rounded-xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">Recent Activity</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="pb-3 font-medium">Agent</th>
                  <th className="pb-3 font-medium">Task</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentActivity.map((row, i) => (
                  <tr key={i} className="text-foreground">
                    <td className="py-3 font-medium">{row.agent}</td>
                    <td className="py-3 text-muted-foreground">{row.task}</td>
                    <td className="py-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge[row.status]}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="py-3 text-muted-foreground text-right">{row.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Agent Status */}
        <div className="glass-panel rounded-xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">Agent Status</h2>
          <ul className="space-y-3">
            {agents.map((agent) => (
              <li key={agent.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full ${agent.color}`} />
                  <span className="text-sm text-foreground">{agent.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">{agent.status}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
