import { useState } from 'react'
import { MessageCircle } from 'lucide-react'

export default function App() {
  const [count, setCount] = useState(0)

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12 text-slate-100">
      <section className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-xl sm:p-12">
        <MessageCircle aria-hidden="true" className="mb-6 h-10 w-10 text-teal-400" />
        <p className="text-sm font-semibold uppercase tracking-widest text-teal-400">
          Frontend setup
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Live Chat</h1>
        <p className="mt-4 leading-relaxed text-slate-300">
          React, Vite, TypeScript, and Tailwind CSS are ready. Use the button to
          check that React state updates work.
        </p>
        <button
          type="button"
          onClick={() => setCount((value) => value + 1)}
          className="mt-8 rounded-lg bg-teal-400 px-5 py-3 font-semibold text-slate-950 transition-colors hover:bg-teal-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-400"
        >
          Test React state
        </button>
        <p aria-live="polite" className="mt-4 text-sm text-slate-300">
          Button clicks: {count}
        </p>
      </section>
    </main>
  )
}
