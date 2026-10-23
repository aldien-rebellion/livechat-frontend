export type AuthFields = { full_name: string; username: string; email: string; password: string; confirmPassword: string }
export function validateAuth(values: AuthFields, register: boolean) {
  const errors: Partial<Record<keyof AuthFields, string>> = {}
  if (!values.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = 'Enter a valid email address.'
  if (!values.password.trim()) errors.password = 'Enter your password.'
  if (register) {
    if (!values.full_name.trim() || values.full_name.trim().length > 100) errors.full_name = 'Enter a name between 1 and 100 characters.'
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(values.username.trim())) errors.username = 'Use 3–30 letters, numbers or underscores.'
    if (values.password.length < 8 || values.password.length > 128 || !values.password.trim()) errors.password = 'Use a password between 8 and 128 characters.'
    if (values.confirmPassword !== values.password) errors.confirmPassword = 'Passwords do not match.'
  }
  return errors
}
