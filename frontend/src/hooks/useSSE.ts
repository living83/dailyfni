import { useState, useCallback, useRef } from 'react'

export interface SSEEvent {
  event: string
  data: any
}

/**
 * SSE 스트리밍 훅 — Python FastAPI 콘텐츠 생성용
 * fetch + ReadableStream 방식 (EventSource는 POST 미지원)
 */
export function useSSE() {
  const [events, setEvents] = useState<SSEEvent[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [latestEvent, setLatestEvent] = useState<SSEEvent | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const start = useCallback(async (url: string, body: any) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setEvents([])
    setLatestEvent(null)
    setIsStreaming(true)

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        throw new Error(`SSE 연결 실패: ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let eventType = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const data = JSON.parse(line.slice(6))
              const evt: SSEEvent = { event: eventType, data }
              setEvents((prev) => [...prev, evt])
              setLatestEvent(evt)
            } catch { /* ignore parse errors */ }
            eventType = ''
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        const errorEvt: SSEEvent = { event: 'error', data: { message: err.message } }
        setEvents((prev) => [...prev, errorEvt])
        setLatestEvent(errorEvt)
      }
    } finally {
      setIsStreaming(false)
    }
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
  }, [])

  return { events, latestEvent, isStreaming, start, stop }
}
