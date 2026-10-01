// Effective (business) date of a transaction, as entered by an admin in a
// <input type="datetime-local"> (the admin's local time). The database also
// enforces: not in the future, not before 2020, reason required.
const pad = (n: number) => String(n).padStart(2, '0')

export function toLocalInput(d: Date | string) {
  const x = typeof d === 'string' ? new Date(d) : d
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`
}

// '' → null (use now). Returns an ISO string or an error message.
export function parseEffective(local: string): { iso: string | null; error: string } {
  if (!local) return { iso: null, error: '' }
  const ms = new Date(local).getTime()
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local) || Number.isNaN(ms)) return { iso: null, error: 'Enter a valid effective date.' }
  if (ms > Date.now() + 5 * 60_000) return { iso: null, error: 'The effective date cannot be in the future.' }
  if (ms < Date.UTC(2020, 0, 1)) return { iso: null, error: 'The effective date is too far in the past.' }
  return { iso: new Date(ms).toISOString(), error: '' }
}
