import { useState, useEffect, useCallback } from 'react'
import {
  Zap, Play, Trash2, CheckCircle2, Loader2, Clock, XCircle,
  AlertTriangle, Info, Send, Square, PlayCircle,
} from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import api from '../lib/api'
import StatusBadge from '../components/StatusBadge'
import EmptyState from '../components/EmptyState'
import { PageSkeleton } from '../components/LoadingSkeleton'
import type { PostingQueueItem, ErrorLogEntry, PostingStatus } from '../types'

type Severity = '경고' | '오류' | '정보'

function StatusIcon({ status }: { status: PostingStatus }) {
  switch (status) {
    case '발행완료': return <CheckCircle2 className="w-4 h-4 text-emerald" />
    case '발행중': return <Loader2 className="w-4 h-4 text-amber animate-spin" />
    case '대기중': return <Clock className="w-4 h-4 text-muted-foreground" />
    case '실패': return <XCircle className="w-4 h-4 text-destructive" />
  }
}

const statusStyle: Record<PostingStatus, string> = {
  발행완료: 'bg-emerald/15 text-emerald', 발행중: 'bg-amber/15 text-amber',
  대기중: 'bg-muted text-muted-foreground', 실패: 'bg-destructive/15 text-destructive',
}
const severityStyle: Record<Severity, string> = {
  경고: 'bg-amber/15 text-amber', 오류: 'bg-destructive/15 text-destructive', 정보: 'bg-primary/15 text-primary',
}
function SeverityIcon({ severity }: { severity: Severity }) {
  switch (severity) {
    case '경고': return <AlertTriangle className="w-3.5 h-3.5 text-amber" />
    case '오류': return <XCircle className="w-3.5 h-3.5 text-destructive" />
    case '정보': return <Info className="w-3.5 h-3.5 text-primary" />
  }
}

export default function Posting() {
  const { toast } = useToast()

  const [queue, setQueue] = useState<PostingQueueItem[]>([])
  const [errors, setErrors] = useState<ErrorLogEntry[]>([])
  const [logs, setLogs] = useState<{time: string; level: string; message: string}[]>([])
  const [loading, setLoading] = useState(true)
  const [runningAll, setRunningAll] = useState(false)
  const [schedulerRunning, setSchedulerRunning] = useState(false)
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())

  const fetchQueue = useCallback(async () => {
    try { const { data } = await api.get('/posting/queue'); setQueue(data.queue || []) } catch {}
    setLoading(false)
  }, [])
  const fetchErrors = useCallback(async () => {
    try { const { data } = await api.get('/posting/errors'); setErrors(data.errors || []) } catch {}
  }, [])
  const fetchLogs = useCallback(async () => {
    try { const { data } = await api.get('/posting/scheduler-logs'); setLogs(data.logs || []) } catch {}
  }, [])

  const fetchStatus = useCallback(async () => {
    try { const { data } = await api.get('/posting/scheduler-status'); setSchedulerRunning(data.running) } catch {}
  }, [])

  useEffect(() => { fetchQueue(); fetchErrors(); fetchLogs(); fetchStatus() }, [fetchQueue, fetchErrors, fetchLogs, fetchStatus])
  useEffect(() => { const id = setInterval(() => { fetchLogs(); fetchStatus() }, 3000); return () => clearInterval(id) }, [fetchLogs, fetchStatus])

  const handleStop = async () => {
    try { await api.post('/posting/scheduler/stop'); setSchedulerRunning(false); toast('success', '스케줄러 정지됨') } catch { toast('error', '정지 실패') }
  }
  const handleStart = async () => {
    try { await api.post('/posting/scheduler/start'); setSchedulerRunning(true); toast('success', '스케줄러 시작됨') } catch { toast('error', '시작 실패') }
  }

  const handleRunAll = async () => {
    setRunningAll(true)
    try {
      const { data } = await api.post('/posting/run-all')
      toast('success', data.message || '발행이 시작되었습니다.')
      let polls = 0
      const pid = window.setInterval(() => { fetchQueue(); fetchErrors(); polls++; if (polls >= 12) clearInterval(pid) }, 5000)
    } catch { toast('error', '발행 실행에 실패했습니다.') }
    setRunningAll(false)
  }

  const handleRunOne = async (id: string) => {
    setRunningIds(prev => new Set(prev).add(id))
    try {
      const { data } = await api.post(`/posting/queue/${id}/run`)
      toast('success', data.message || '발행이 시작되었습니다.')
      let polls = 0
      const pid = window.setInterval(() => {
        fetchQueue(); fetchErrors(); polls++
        if (polls >= 12) { clearInterval(pid); setRunningIds(prev => { const n = new Set(prev); n.delete(id); return n }) }
      }, 5000)
    } catch {
      toast('error', '발행 실행에 실패했습니다.')
      setRunningIds(prev => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  const handleDelete = async (id: string) => {
    try { await api.delete(`/posting/queue/${id}`); setQueue(prev => prev.filter(r => r.id !== id)); toast('success', '삭제됨') } catch { toast('error', '삭제 실패') }
  }

  if (loading) return <PageSkeleton />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">포스팅 관리</h1>
          <p className="text-sm text-muted-foreground">수동 포스팅 발행 및 오류 로그를 관리합니다</p>
        </div>
        <div className="flex items-center gap-2">
          {schedulerRunning ? (
            <button onClick={handleStop}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-white text-sm font-medium hover:bg-destructive/90 transition-colors">
              <Square className="w-4 h-4" /> 스케줄러 중지
            </button>
          ) : (
            <button onClick={handleStart}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors">
              <PlayCircle className="w-4 h-4" /> 스케줄러 시작
            </button>
          )}
          <button onClick={handleRunAll} disabled={runningAll}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald text-white text-sm font-medium hover:bg-emerald/90 transition-colors disabled:opacity-50">
            {runningAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            즉시 발행
          </button>
        </div>
      </div>

      {/* 자동 포스팅 스케줄은 시스템 설정 페이지로 이동되었다는 안내 */}
      <div className="flex items-center gap-3 p-4 rounded-lg border border-primary/20 bg-primary/5">
        <Info className="w-4 h-4 text-primary shrink-0" />
        <p className="text-sm text-muted-foreground">
          자동 포스팅 스케줄 설정은 <span className="text-foreground font-medium">시스템 설정</span> 페이지로 이동되었습니다.
        </p>
      </div>

      {/* 2:1 분할 — 좌: 수동 포스팅 큐, 우: 오류 로그 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 수동 포스팅 큐 (2/3) */}
        <div className="glass-panel rounded-xl p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold text-foreground mb-4">수동 포스팅 큐</h2>
          {queue.length === 0 ? (
            <EmptyState icon={<Send className="w-12 h-12" />} title="포스팅 큐가 비어 있습니다" description="콘텐츠를 생성하고 포스팅 큐에 추가해 보세요." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="pb-3 font-medium">#</th>
                    <th className="pb-3 font-medium">키워드</th>
                    <th className="pb-3 font-medium">대상계정</th>
                    <th className="pb-3 font-medium">톤</th>
                    <th className="pb-3 font-medium">상태</th>
                    <th className="pb-3 font-medium">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {queue.map((row, idx) => (
                    <tr key={row.id} className="text-foreground hover:bg-white/[0.03] transition-colors">
                      <td className="py-3 text-muted-foreground">{idx + 1}</td>
                      <td className="py-3 font-medium">{row.keyword}</td>
                      <td className="py-3 text-muted-foreground">{row.accountName}</td>
                      <td className="py-3"><StatusBadge label={row.tone} /></td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle[row.status]}`}>
                          <StatusIcon status={row.status} />{row.status}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleRunOne(row.id)}
                            disabled={runningIds.has(row.id) || row.status === '발행중' || row.status === '발행완료'}
                            className="p-1.5 rounded-md hover:bg-primary/15 text-muted-foreground hover:text-primary transition-colors disabled:opacity-30" title="즉시 실행">
                            {runningIds.has(row.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                          </button>
                          <button onClick={() => handleDelete(row.id)}
                            className="p-1.5 rounded-md hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors" title="삭제">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 오류 로그 (1/3) */}
        <div className="glass-panel rounded-xl p-5 lg:col-span-1">
          <h2 className="text-lg font-semibold text-foreground mb-4">오류 로그</h2>
          {errors.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="w-10 h-10" />} title="오류가 없습니다" />
          ) : (
            <ul className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {errors.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <div className="mt-0.5"><SeverityIcon severity={entry.severity} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">{entry.timestamp}</span>
                      <span className="text-xs font-medium text-foreground">{entry.accountName}</span>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${severityStyle[entry.severity]}`}>{entry.severity}</span>
                    </div>
                    <p className="text-sm text-foreground break-words">{entry.message}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 스케줄러 실시간 로그 */}
      <div className="glass-panel rounded-xl p-5">
        <h2 className="text-lg font-semibold text-foreground mb-4">스케줄러 실시간 로그 <span className="text-xs text-muted-foreground font-normal ml-2">3초마다 갱신</span></h2>
        <div className="max-h-[400px] overflow-y-auto space-y-1 font-mono text-xs">
          {logs.length === 0 ? (
            <p className="text-muted-foreground text-sm">로그가 없습니다</p>
          ) : logs.map((log, i) => {
            const time = new Date(log.time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            const color = log.level === 'error' ? 'text-red-400' : log.level === 'success' ? 'text-emerald' : log.level === 'warn' ? 'text-amber' : log.level === 'skip' ? 'text-muted-foreground/50' : 'text-muted-foreground'
            return (
              <div key={i} className={`${color} ${log.level === 'skip' ? 'opacity-50' : ''}`}>
                <span className="text-muted-foreground/70">{time}</span> {log.message}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
