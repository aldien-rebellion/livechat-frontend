import { createContext } from 'react'
import type { AuthSession, LoginInput, RegisterInput } from '../types/auth'

export const AuthContext = createContext<{
  session: AuthSession | null
  login: (input: LoginInput) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => void
} | null>(null)
