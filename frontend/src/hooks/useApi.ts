import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../lib/api'

/* ── GET 요청 + 자동 로딩/에러 ── */
export function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(!!url)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!url) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(url)
      setData(res.data)
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || '요청 실패')
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { data, loading, error, refetch, setData }
}

/* ── POST/PATCH/DELETE + 로딩/에러 ── */
export function useMutation<TResponse = any, TBody = any>(
  url: string,
  method: 'post' | 'put' | 'patch' | 'delete' = 'post'
) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutate = async (body?: TBody): Promise<TResponse | null> => {
    setLoading(true)
    setError(null)
    try {
      const res = await api[method](url, body)
      return res.data as TResponse
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || '요청 실패'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }

  return { mutate, loading, error }
}

/* ── 자동 새로고침 (polling) ── */
export function usePolling<T>(url: string | null, intervalMs: number) {
  const result = useFetch<T>(url)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    if (!url || intervalMs <= 0) return
    intervalRef.current = setInterval(() => result.refetch(), intervalMs)
    return () => clearInterval(intervalRef.current)
  }, [url, intervalMs, result.refetch])

  return result
}
