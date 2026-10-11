// Next.js 14 keeps server-side fetch() results in its Data Cache by default,
// and supabase-js makes every database, auth and storage call through
// fetch(). Without this, a server route could keep answering with rows read
// minutes or hours earlier (the market quotes route did exactly that in
// production, so fresh quotes showed as stale). Every server-side Supabase
// client passes this fetch so each read asks the database.
export const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: 'no-store' })
