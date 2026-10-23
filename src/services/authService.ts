import { createAuthClient } from './authClient'
import type { AxiosAdapter } from 'axios'

export const isMockAuth = import.meta.env.DEV && import.meta.env.VITE_AUTH_MODE === 'mock'
const mock = isMockAuth ? import('./mockAuthAdapter').then(({ createMockAuthAdapter }) => createMockAuthAdapter()) : undefined
const adapter: AxiosAdapter | undefined = mock ? async (config) => (await mock)(config) : undefined
export const authService = createAuthClient(import.meta.env.VITE_API_BASE_URL || '/api/v1', adapter)
