// Admin-only: create a client login with the email already confirmed.
//
// Runs inside Supabase, where SUPABASE_SERVICE_ROLE_KEY is provided by the
// platform; the key never reaches the Next.js app or any browser. The caller
// must present their own access token and be an admin (public.is_admin()).
// The login is created through the Supabase Auth Admin API; the existing
// on_auth_user_created trigger creates the linked profile (role 'customer')
// and the zero-balance account, exactly as for a public sign-up.
// The password is passed to Auth only: it is never stored, logged or echoed.
//
// Deployed with verify_jwt = false on purpose: every request is verified here
// against the Auth server (auth.getUser) before anything else runs, which
// works with both legacy and new asymmetric JWT signing keys; the gateway's
// own check only understands the legacy secret.
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ACTION = 'ADMIN_CREATED_CLIENT_ACCOUNT'
const HOURLY_LIMIT = 20

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function passwordProblem(password: string, email: string) {
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const auth = req.headers.get('Authorization') || ''
  if (!/^Bearer\s+[\w-]+\.[\w-]+\.[\w-]+$/.test(auth)) return json({ error: 'Please sign in again.' }, 401)

  // Who is calling, and are they an admin? Both answered with the caller's
  // own token, so the database's own rules decide.
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: who, error: whoErr } = await caller.auth.getUser()
  if (whoErr || !who?.user) return json({ error: 'Please sign in again.' }, 401)
  const adminId = who.user.id
  const { data: isAdmin, error: roleErr } = await caller.rpc('is_admin')
  if (roleErr) return json({ error: 'Could not verify permissions. Please try again.' }, 503)
  if (isAdmin !== true) return json({ error: 'Only admins can create client accounts.' }, 403)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Invalid request.' }, 400) }
  const fullName = String(body.full_name ?? '').replace(/\s+/g, ' ').trim()
  const email = String(body.email ?? '').replace(/[^\x20-\x7E]/g, '').trim().toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  if (fullName.length < 2 || fullName.length > 120) return json({ error: 'Enter the client’s full name (2 to 120 characters).' }, 400)
  if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: 'Enter a valid email address.' }, 400)
  const weak = passwordProblem(password, email)
  if (weak) return json({ error: weak }, 400)

  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

  // Per-admin limit, counted from the audit log so it holds across instances.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await service.from('audit_logs').select('id', { count: 'exact', head: true })
    .eq('action', ACTION).eq('actor_id', adminId).gte('created_at', since)
  if ((count ?? 0) >= HOURLY_LIMIT) return json({ error: 'Too many accounts created in the last hour. Please try again later.' }, 429)

  const audit = (target: string | null, result: string, details: Record<string, unknown>) =>
    service.from('audit_logs').insert({
      user_id: adminId, actor_id: adminId, target_user_id: target, action: ACTION,
      entity: 'auth_user', entity_id: target, details, result,
    })

  // email_confirm: true marks this one login as confirmed, so Auth sends no
  // sign-up confirmation email. Project-wide confirmation stays unchanged.
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fullName },
  })
  if (createErr || !created?.user) {
    const code = (createErr as { code?: string } | null)?.code || ''
    const msg = createErr?.message || ''
    if (code === 'email_exists' || code === 'user_already_exists' || /already (been )?registered|already exists/i.test(msg)) {
      await audit(null, 'rejected', { email, reason: 'email_already_registered', method: 'admin_panel' })
      return json({ error: 'This email is already registered. No account was created and the existing account was not changed.' }, 409)
    }
    if (code === 'weak_password') return json({ error: msg || 'Password does not meet the password policy.' }, 400)
    if (code === 'email_address_invalid' || code === 'validation_failed') return json({ error: 'Enter a valid email address.' }, 400)
    console.error('admin-create-client: createUser failed', code, createErr?.status)
    return json({ error: 'The account could not be created. Please try again.' }, 502)
  }

  const userId = created.user.id
  // The trigger creates the profile and account in the same transaction as
  // the login. Confirm the link rather than assume it.
  const [{ data: profile }, { data: account }] = await Promise.all([
    service.from('profiles').select('id, role, full_name, email_verified_at').eq('id', userId).maybeSingle(),
    service.from('accounts').select('user_id').eq('user_id', userId).maybeSingle(),
  ])
  if (!profile || !account) {
    console.error('admin-create-client: profile/account missing after createUser', userId)
    await audit(userId, 'error', { email, reason: 'profile_link_missing', method: 'admin_panel' })
    return json({ error: 'The login was created but its client profile is missing. Check the client list before retrying.' }, 500)
  }

  await audit(userId, 'success', {
    email, full_name: fullName, email_confirmed: true, method: 'admin_panel', role: profile.role,
  })

  return json({ user_id: userId, email, full_name: fullName, role: profile.role, email_confirmed: Boolean(created.user.email_confirmed_at) }, 201)
})
