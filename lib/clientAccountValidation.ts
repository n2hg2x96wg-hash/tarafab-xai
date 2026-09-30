// Input rules for an admin-created client account. The same rules are
// enforced again inside the admin-create-client Edge Function, which is the
// authority; this copy gives the form and the API route early, clear errors.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function normaliseEmail(raw: unknown) {
  return String(raw ?? '').replace(/[^\x20-\x7E]/g, '').trim().toLowerCase()
}

export function normaliseName(raw: unknown) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim()
}

// Returns the first problem with the password, or '' when it is acceptable.
export function passwordProblem(password: string, email = '') {
  if (password.length < 12) return 'Password must be at least 12 characters.'
  if (password.length > 72) return 'Password must be at most 72 characters.'
  if (/[^\x21-\x7E]/.test(password)) return 'Password may only use standard keyboard characters, without spaces.'
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return 'Password must include an uppercase letter, a lowercase letter, a number and a symbol.'
  }
  const local = email.split('@')[0]
  if (local.length >= 4 && password.toLowerCase().includes(local.toLowerCase())) return 'Password must not contain the email address.'
  return ''
}

export function validateNewClient(input: { full_name?: unknown; email?: unknown; password?: unknown }) {
  const full_name = normaliseName(input.full_name)
  const email = normaliseEmail(input.email)
  const password = typeof input.password === 'string' ? input.password : ''
  let error = ''
  if (full_name.length < 2) error = 'Enter the client’s full name.'
  else if (full_name.length > 120) error = 'Full name must be at most 120 characters.'
  else if (!EMAIL_RE.test(email) || email.length > 254) error = 'Enter a valid email address.'
  else error = passwordProblem(password, email)
  return { full_name, email, password, error }
}
