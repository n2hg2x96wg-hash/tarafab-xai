import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters');
}

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

function setLocalUserFromSupabaseUser(supabaseUser) {
  const email = supabaseUser.email?.trim().toLowerCase();
  if (!email) throw new Error('Supabase user has no email address');

  const fullName = String(
    supabaseUser.user_metadata?.full_name
      || supabaseUser.user_metadata?.name
      || email.split('@')[0],
  ).trim().slice(0, 160) || email.split('@')[0];
  const now = new Date().toISOString();
  const emailVerified = supabaseUser.email_confirmed_at ? 1 : 0;

  const existing = global.db.prepare('SELECT id, fullName, email, role FROM users WHERE email = ?').get(email);

  if (existing) {
    global.db.prepare(
      'UPDATE users SET fullName = ?, emailVerified = ?, updatedAt = ? WHERE id = ?',
    ).run(fullName, emailVerified, now, existing.id);

    return {
      id: existing.id,
      fullName,
      email,
      role: existing.role || 'customer',
      supabaseUserId: supabaseUser.id,
    };
  }

  const result = global.db.transaction(() => {
    const insertUser = global.db.prepare(`
      INSERT INTO users (fullName, email, passwordHash, emailVerified, role, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, 'customer', ?, ?)
    `).run(fullName, email, `supabase:${supabaseUser.id}`, emailVerified, now, now);

    global.db.prepare(`
      INSERT INTO accounts (userId, accountBalance, availableBalance, investedBalance, pendingBalance, createdAt, updatedAt)
      VALUES (?, 0, 0, 0, 0, ?, ?)
    `).run(insertUser.lastInsertRowid, now, now);

    return insertUser.lastInsertRowid;
  })();

  return {
    id: Number(result),
    fullName,
    email,
    role: 'customer',
    supabaseUserId: supabaseUser.id,
  };
}

export async function verifyToken(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Unauthorized: Bearer token required' });
  }

  try {
    try {
      req.user = jwt.verify(token, jwtSecret);
      return next();
    } catch {
      if (!supabaseAdmin) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
      }

      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !data.user) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
      }

      req.user = setLocalUserFromSupabaseUser(data.user);
      return next();
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
}

export function verifyAdmin(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin role required' });
    }
    next();
  });
}
