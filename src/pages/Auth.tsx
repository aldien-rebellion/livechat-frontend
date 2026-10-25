import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { authErrorMessage } from '../services/authClient'
import { isMockAuth } from '../services/authService'
import { validateAuth } from '../services/authValidation'
import type { AuthFields } from '../services/authValidation'

export default function Auth({ mode }: { mode: 'login' | 'register' }) {
  const register = mode === 'register'
  const { login, register: createAccount } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [values, setValues] = useState<AuthFields>({ full_name: '', username: '', email: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState<Partial<Record<keyof AuthFields, string>>>({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy.current) return
    const nextErrors = validateAuth(values, register)
    setErrors(nextErrors)
    setError('')
    const first = Object.keys(nextErrors)[0]
    if (first) { (form.current?.elements.namedItem(first) as HTMLInputElement)?.focus(); return }
    busy.current = true
    setPending(true)
    try {
      const input = { email: values.email.trim().toLowerCase(), password: values.password }
      if (register) {
        await createAccount({ ...input, username: values.username.trim(), full_name: values.full_name.trim() })
        navigate('/login', { replace: true, state: { registered: true } })
      } else {
        await login(input)
        navigate('/workspace', { replace: true })
      }
    } catch (reason) { setError(authErrorMessage(reason)) }
    finally { busy.current = false; setPending(false) }
  }
  const fields: { name: keyof AuthFields; label: string; type?: string; autoComplete: string; hint?: string }[] = [
    ...(register ? [{ name: 'full_name' as const, label: 'Full name', autoComplete: 'name' }, { name: 'username' as const, label: 'Username', autoComplete: 'username', hint: '3–30 letters, numbers or underscores.' }] : []),
    { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
    { name: 'password', label: 'Password', type: 'password', autoComplete: register ? 'new-password' : 'current-password', hint: register ? 'Use 8–128 characters.' : undefined },
    ...(register ? [{ name: 'confirmPassword' as const, label: 'Confirm password', type: 'password', autoComplete: 'new-password' }] : []),
  ]
  return <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-4 py-10 text-slate-100 sm:px-8">
    <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl sm:p-10" aria-labelledby="auth-title">
      <div className="mb-8 flex items-center gap-3 font-semibold"><MessageCircle aria-hidden="true" className="h-7 w-7 text-teal-300" />LiveChat</div>
      <p className="text-xs font-semibold uppercase tracking-widest text-teal-300">Your team, connected</p>
      <h1 id="auth-title" className="mt-3 text-3xl font-semibold tracking-tight">{register ? 'Create your account' : 'Welcome back'}</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-400">{register ? 'A place for your conversations to come together.' : 'Sign in to continue to your workspace.'}</p>
      {isMockAuth && <p className="mt-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">Mock authentication · Register a test account first. Accounts reset on reload. Use test details only.</p>}
      {!register && location.state?.registered && <p role="status" className="mt-5 text-sm text-teal-300">Account created. Sign in with your new details.</p>}
      <form ref={form} noValidate onSubmit={submit} aria-busy={pending} className="mt-6 space-y-4">
        <fieldset disabled={pending} className="space-y-4">
          {fields.map(({ name, label, type = 'text', autoComplete, hint }) => <div key={name}>
            <label htmlFor={name} className="mb-2 block text-sm font-medium">{label}</label>
            <input id={name} name={name} type={type} autoComplete={autoComplete} required value={values[name]} aria-invalid={!!errors[name]} aria-describedby={errors[name] || hint ? `${name}-help` : undefined} onChange={(event) => { setValues({ ...values, [name]: event.target.value }); setErrors({ ...errors, [name]: undefined }); setError('') }} className="w-full min-w-0 rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-base outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-300/30 disabled:opacity-60" />
            {(errors[name] || hint) && <p id={`${name}-help`} className={`mt-2 text-sm ${errors[name] ? 'text-rose-300' : 'text-slate-400'}`}>{errors[name] || hint}</p>}
          </div>)}
        </fieldset>
        {error && <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
        <button disabled={pending} className="w-full rounded-lg bg-teal-300 px-4 py-3 font-semibold text-slate-950 hover:bg-teal-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-300 disabled:cursor-wait disabled:opacity-60">{pending ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
        <p role="status" className="sr-only">{pending ? 'Submitting your details' : ''}</p>
      </form>
      <p className="mt-6 text-center text-sm text-slate-400">{register ? 'Already have an account? ' : 'New to LiveChat? '}<Link className="rounded text-teal-300 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300" to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</Link></p>
    </section>
  </main>
}
