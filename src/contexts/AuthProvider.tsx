import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { authService } from '../services/authService'
import { AuthContext } from './authContext'

export default function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(authService.subscribe, authService.getSession)
  return <AuthContext value={{ session, login: authService.login, register: authService.register, logout: authService.logout }}>{children}</AuthContext>
}
