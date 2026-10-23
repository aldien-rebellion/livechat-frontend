import axios from 'axios'
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import type { AuthSession, LoginInput, RefreshResult, RegisterInput } from '../types/auth'

// Payloads not fully specified by Backend #11 are isolated here for integration.
export function createAuthClient(baseURL: string, adapter?: AxiosAdapter) {
  const transport = axios.create({ baseURL, timeout: 15000, adapter })
  const api = axios.create({ baseURL, timeout: 15000, adapter })
  let session: AuthSession | null = null
  let revision = 0
  let identity = 0
  let refreshing: Promise<AuthSession> | null = null
  const listeners = new Set<(value: AuthSession | null) => void>()

  function setSession(value: AuthSession | null) {
    session = value
    revision += 1
    listeners.forEach((listener) => listener(value))
  }

  async function authenticate(path: string, input: LoginInput | RegisterInput) {
    const started = revision
    const { data } = await transport.post<AuthSession>(path, input)
    if (!data.access_token || !data.refresh_token || data.token_type !== 'bearer' || !data.user?.id) {
      throw new Error('The authentication server returned an invalid response.')
    }
    if (started !== revision) throw new Error('Authentication was cancelled. Please try again.')
    identity += 1
    setSession(data)
  }

  function refresh() {
    if (refreshing) return refreshing
    const previous = session
    const started = revision
    if (!previous) return Promise.reject(new Error('Please sign in again.'))
    const pending = transport.post<RefreshResult>('/auth/refresh', { refresh_token: previous.refresh_token })
      .then(({ data }) => {
        if (started !== revision) throw new Error('The session has changed.')
        if (!data.access_token) throw new Error('Invalid refresh response.')
        const next = { ...previous, access_token: data.access_token, refresh_token: data.refresh_token ?? previous.refresh_token }
        setSession(next)
        return next
      })
      .catch((error: unknown) => {
        if (started === revision) setSession(null)
        throw error
      })
      .finally(() => { if (refreshing === pending) refreshing = null })
    refreshing = pending
    return pending
  }

  type AuthRequest = InternalAxiosRequestConfig & { authIdentity?: number; authRetried?: boolean }
  api.interceptors.request.use((config: AuthRequest) => {
    config.authIdentity = identity
    if (session) config.headers.set('Authorization', `Bearer ${session.access_token}`)
    else config.headers.delete('Authorization')
    return config
  })
  api.interceptors.response.use((response) => response, async (error: unknown) => {
    if (!axios.isAxiosError(error)) throw error
    const config = error.config as AuthRequest | undefined
    if (error.response?.status !== 401 || !config || !session) throw error
    const sentToken = config.headers.get('Authorization')
    // Never replay a request from a logged-out or replaced session.
    if (config.authIdentity !== identity) throw error
    if (config.authRetried) {
      if (sentToken === `Bearer ${session.access_token}`) setSession(null)
      throw error
    }
    config.authRetried = true
    if (sentToken === `Bearer ${session.access_token}`) await refresh()
    if (!session || config.authIdentity !== identity) throw error
    return api.request(config)
  })

  return {
    api,
    refresh,
    getSession: () => session,
    subscribe(listener: (value: AuthSession | null) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    login: (input: LoginInput) => authenticate('/auth/login', input),
    // Registration response is unspecified: register, then explicitly log in.
    async register(input: RegisterInput) { await transport.post('/auth/register', input) },
    logout() { identity += 1; setSession(null); refreshing = null },
  }
}

export function authErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    if (status === 401) return 'Email or password is incorrect.'
    if (status === 409) return 'This email or username is already registered.'
    if (status === 422) return 'Please check your details and try again.'
    if (status === 429) return 'Too many attempts. Please try again later.'
    if (!error.response) return 'Unable to reach the authentication server. Please try again.'
    return 'Authentication is unavailable. Please try again later.'
  }
  return 'Unable to complete authentication. Please try again.'
}
