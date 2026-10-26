export interface AuthUser {
  id: string
  email: string
  username: string
  full_name: string
  is_admin?: boolean
}

export interface LoginInput { email: string; password: string }
export interface RegisterInput extends LoginInput { username: string; full_name: string }
export interface AuthSession {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  user: AuthUser
}
export interface RefreshResult {
  access_token: string
  refresh_token?: string
}
