import { RECOVERY_FLAG } from './recovery'

// A password-reset email link signs the account in and returns to the site
// with "#...&type=recovery" in the address. When the reset page is not on the
// Supabase project's allowed redirect list, Supabase sends the link to the
// Site URL (the home page) instead, which left people signed in on the home
// page with no way to choose a new password. This runs before any page loads
// and moves such a link to the reset page, keeping its tokens in the address
// so the reset page can read them.
// /auth/confirm (the branded link, see lib/auth/recovery.ts) handles its own
// "#token_hash=…&type=recovery" and is left alone.
// When the address carries Supabase's recovery session, it also marks the tab
// as being in password recovery (lib/auth/recovery.ts) here, because the Supabase client removes the tokens from the address as
// soon as it starts, possibly before the reset page has read them.
// Any other sign-in tokens in the address (the sign-up confirmation link
// returns with "#access_token=…&type=signup") are removed unused before
// anything else on the page can read them; the person then signs in as usual.
export const recoveryRedirectScript = `(function(){try{var h=location.hash||'',p=location.pathname;if(p!=='/auth/confirm'&&/(^#|&)type=recovery(&|$)/.test(h)){if(/(^#|&)access_token=/.test(h)){try{sessionStorage.setItem('${RECOVERY_FLAG}',String(Date.now()))}catch(e){}}if(p!=='/reset-password'){location.replace('/reset-password'+h)}}else if(p!=='/auth/confirm'&&/(^#|&)access_token=/.test(h)){history.replaceState(null,'',p+location.search)}}catch(e){}})()`
