import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Search,
  TrendingUp,
  PenTool,
  Image,
  CheckCircle,
  Send,
  Sparkles,
  Workflow,
  ChevronDown,
  Check,
  X,
  ArrowRight,
} from 'lucide-react'
import api from '../lib/api'

type StepStatus = 'idle' | 'running' | 'done' | 'error'

interface PipelineStep {
  name: string
  icon: React.ElementType
  color: string
  status: StepStatus
}

const initialSteps: PipelineStep[] = [
  { name: 'Research', icon: Search, color: 'text-blue-400', status: 'idle' },
  { name: 'SEO', icon: TrendingUp, color: 'text-green-400', status: 'idle' },
  { name: 'Writing', icon: PenTool, color: 'text-violet-400', status: 'idle' },
  { name: 'Image', icon: Image, color: 'text-pink-400', status: 'idle' },
  { name: 'Review', icon: CheckCircle, color: 'text-amber-400', status: 'idle' },
  { name: 'Publish', icon: Send, color: 'text-emerald-400', status: 'idle' },
]

const borderByStatus: Record<StepStatus, string> = {
  idle: 'border-[rgba(255,255,255,0.08)]',
  running: 'border-primary shadow-lg shadow-primary/20',
  done: 'border-emerald-500 shadow-lg shadow-emerald-500/20',
  error: 'border-destructive shadow-lg shadow-destructive/20',
}

export default function Pipeline() {
  const [products, setProducts] = useState<{ id: number; name: string }[]>([])
  const [selectedProduct, setSelectedProduct] = useState('')
  const [steps, setSteps] = useState<PipelineStep[]>(initialSteps)
  const [running, setRunning] = useState(false)
  const [completed, setCompleted] = useState(false)
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    api
      .get('/products')
      .then(({ data }) => setProducts(data))
      .catch(() =>
        setProducts([
          { id: 1, name: '갤럭시 S24' },
          { id: 2, name: '에어팟 프로' },
          { id: 3, name: '다이슨 에어랩' },
        ])
      )
  }, [])

  const runPipeline = useCallback(() => {
    if (running) return
    setRunning(true)
    setCompleted(false)
    setSteps(initialSteps.map((s) => ({ ...s, status: 'idle' as StepStatus })))

    // Clear any lingering timeouts
    timeouts.current.forEach(clearTimeout)
    timeouts.current = []

    initialSteps.forEach((_, idx) => {
      // Set step to running
      const runT = setTimeout(() => {
        setSteps((prev) =>
          prev.map((s, i) => (i === idx ? { ...s, status: 'running' } : s))
        )
      }, idx * 1500)
      timeouts.current.push(runT)

      // Set step to done
      const doneT = setTimeout(() => {
        setSteps((prev) =>
          prev.map((s, i) => (i === idx ? { ...s, status: 'done' } : s))
        )
        if (idx === initialSteps.length - 1) {
          setRunning(false)
          setCompleted(true)
        }
      }, idx * 1500 + 1000)
      timeouts.current.push(doneT)
    })
  }, [running])

  useEffect(() => {
    return () => timeouts.current.forEach(clearTimeout)
  }, [])

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">AI Pipeline</h1>
        <p className="text-muted-foreground mt-1">
          상품 정보를 입력하면 6단계 AI 파이프라인이 자동 실행됩니다
        </p>
      </div>

      {/* Product Selector + Run Button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative w-full sm:w-72">
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            className="w-full appearance-none rounded-lg bg-input border border-border px-4 py-2.5 pr-10 text-foreground focus:border-primary focus:outline-none transition-colors"
          >
            <option value="">상품을 선택하세요</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>

        <button
          onClick={runPipeline}
          disabled={running}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-medium hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/25"
        >
          <Sparkles className="w-4 h-4" />
          Run Full Pipeline
        </button>
      </div>

      {/* Pipeline Steps */}
      <div className="glass-panel rounded-2xl p-6 overflow-x-auto">
        <div className="flex items-center justify-between min-w-[700px] gap-2">
          {steps.map((step, idx) => {
            const Icon = step.icon
            return (
              <div key={step.name} className="flex items-center gap-2 flex-1">
                {/* Step Box */}
                <div
                  className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 w-full transition-all duration-500 ${
                    borderByStatus[step.status]
                  } ${step.status === 'running' ? 'animate-pulse' : ''} ${
                    step.status === 'idle' ? 'opacity-50' : 'opacity-100'
                  }`}
                >
                  <div className="relative">
                    <Icon
                      className={`w-6 h-6 ${
                        step.status === 'idle'
                          ? 'text-muted-foreground'
                          : step.color
                      }`}
                    />
                    {step.status === 'done' && (
                      <Check className="absolute -top-1 -right-2 w-3.5 h-3.5 text-emerald-400 bg-background rounded-full" />
                    )}
                    {step.status === 'error' && (
                      <X className="absolute -top-1 -right-2 w-3.5 h-3.5 text-destructive bg-background rounded-full" />
                    )}
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      step.status === 'idle'
                        ? 'text-muted-foreground'
                        : 'text-foreground'
                    }`}
                  >
                    {step.name}
                  </span>
                </div>

                {/* Arrow between steps */}
                {idx < steps.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Result Panel */}
      <div className="glass-panel rounded-2xl p-8 min-h-[200px] flex items-center justify-center">
        {completed ? (
          <div className="text-center space-y-3">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto" />
            <h3 className="text-lg font-semibold text-foreground">
              파이프라인 실행 완료
            </h3>
            <p className="text-muted-foreground text-sm max-w-md">
              모든 6단계가 성공적으로 완료되었습니다. 생성된 블로그 글을 확인하세요.
            </p>
          </div>
        ) : (
          <div className="text-center space-y-3">
            <Workflow className="w-12 h-12 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">
              파이프라인을 실행하면 결과가 여기에 표시됩니다
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
