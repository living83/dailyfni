import axios from 'axios'

const api = axios.create({ baseURL: '/api', withCredentials: true })

let onUnauthorized: (() => void) | null = null
export function setOnUnauthorized(fn: () => void) { onUnauthorized = fn }

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 && !err.config.url?.includes('/admin/')) {
      onUnauthorized?.()
    }
    return Promise.reject(err)
  }
)

export default api
