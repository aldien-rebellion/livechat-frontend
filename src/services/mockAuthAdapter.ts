import { AxiosError, AxiosHeaders } from 'axios'
import type { AxiosAdapter, AxiosResponse } from 'axios'
import type { AuthUser, RegisterInput } from '../types/auth'

// Development-only simulator. No seeded credentials and no persistent storage.
// Store password digests so even demo passwords are not kept as plaintext.
export function createMockAuthAdapter(): AxiosAdapter {
  const accounts = new Map<string, { user: AuthUser; digest: string }>()
  const refreshTokens = new Map<string, AuthUser>()
  const digest = async (password: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password)))).map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const token = () => `mock-only-${crypto.randomUUID()}`
  return async (config) => {
    await new Promise((resolve) => setTimeout(resolve, 350))
    const body = JSON.parse(config.data ?? '{}')
    const response = (data: unknown, status = 200): AxiosResponse => ({ data, status, statusText: String(status), headers: new AxiosHeaders(), config })
    const fail = (status: number): never => { throw new AxiosError('Mock auth error', 'ERR_BAD_REQUEST', config, undefined, response({}, status)) }
    if (config.url === '/auth/register') {
      const input = body as RegisterInput
      if (accounts.has(input.email) || [...accounts.values()].some(({ user }) => user.username === input.username)) fail(409)
      accounts.set(input.email, { user: { id: crypto.randomUUID(), email: input.email, username: input.username, full_name: input.full_name }, digest: await digest(input.password) })
      return response({}, 201)
    }
    if (config.url === '/auth/login') {
      const account = accounts.get(body.email)
      if (!account || account.digest !== await digest(body.password)) return fail(401)
      const refresh_token = token()
      refreshTokens.set(refresh_token, account.user)
      return response({ access_token: token(), refresh_token, token_type: 'bearer', user: account.user })
    }
    if (config.url === '/auth/refresh') {
      const user = refreshTokens.get(body.refresh_token)
      if (!user) return fail(401)
      refreshTokens.delete(body.refresh_token)
      const refresh_token = token()
      refreshTokens.set(refresh_token, user)
      return response({ access_token: token(), refresh_token })
    }
    return fail(404)
  }
}
