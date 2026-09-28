'use client'

import { createClient } from '@/lib/supabase/client'

// Calls our own API as the signed-in user. The access token is read at call
// time (Supabase refreshes it in the background and shares it across tabs),
// so a page left open for hours never sends an expired token. A 401 triggers
// one forced refresh and a single retry; every request has a timeout so a
// dropped mobile connection surfaces as an error instead of hanging.

export type ErrorCode = 'network' | 'timeout' | 'unexpected' | 'generic' | 'session' | 'forbidden' | 'notFound' | 'conflict' | 'rateLimited' | 'server'

// `code` is set when the message was produced here rather than sent by the
// server, so the UI can show it in the selected language.
export class RequestError extends Error {
  constructor(message: string, public status: number, public code?: ErrorCode) { super(message) }
}

async function currentToken(force = false) {
  const auth = createClient().auth
  if (force) {
    const { data } = await auth.refreshSession()
    return data.session?.access_token ?? null
  }
  const { data } = await auth.getSession()
  return data.session?.access_token ?? null
}

export async function authFetch(url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<Response> {
  const send = async (token: string | null) => {
    const headers = new Headers(init.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      return await fetch(url, { ...init, headers, signal: ctrl.signal, cache: 'no-store' })
    } catch (e) {
      if (ctrl.signal.aborted) throw new RequestError('The request timed out. Check your connection and try again.', 0, 'timeout')
      throw new RequestError('Could not reach the server. Check your connection and try again.', 0, 'network')
    } finally {
      clearTimeout(timer)
    }
  }

  let res = await send(await currentToken())
  if (res.status === 401) {
    const fresh = await currentToken(true).catch(() => null)
    if (fresh) res = await send(fresh)
  }
  return res
}

// Parses a JSON response and turns any failure into a readable RequestError.
export async function readJson<T>(res: Response): Promise<T> {
  let body: unknown = null
  try { body = await res.json() } catch { /* handled below */ }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error
    throw msg ? new RequestError(msg, res.status) : new RequestError(messageFor(res.status), res.status, codeFor(res.status))
  }
  if (body === null || typeof body !== 'object') throw new RequestError('The server sent an unexpected response. Please try again.', res.status, 'unexpected')
  return body as T
}

export function messageFor(status: number) {
  if (status === 401) return 'Your session has ended. Please sign in again.'
  if (status === 403) return 'You do not have access to this.'
  if (status === 404) return 'Not found.'
  if (status === 409) return 'This changed since you opened it. Refresh to view the latest.'
  if (status === 429) return 'Too many requests. Please wait a moment and try again.'
  return 'Something went wrong on our side. Please try again.'
}

function codeFor(status: number): ErrorCode {
  if (status === 401) return 'session'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'notFound'
  if (status === 409) return 'conflict'
  if (status === 429) return 'rateLimited'
  return 'server'
}

// Pass the translator to get client-side messages in the selected language.
export function errorText(e: unknown, t?: (key: `errors.${ErrorCode}`) => string) {
  if (e instanceof RequestError) return e.code && t ? t(`errors.${e.code}`) : e.message
  return t ? t('errors.generic') : 'Something went wrong. Please try again.'
}

// A key that identifies one submit attempt, so a retry is recognised as the
// same request by the server.
export function newRequestKey() {
  const c = typeof crypto !== 'undefined' ? crypto : undefined
  if (c?.randomUUID) return c.randomUUID()
  const bytes = new Uint8Array(16)
  c?.getRandomValues?.(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('') + Date.now().toString(36)
}
