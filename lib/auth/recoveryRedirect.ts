// A password-reset email link signs the account in and returns to the site
// with "#...&type=recovery" in the address. When the reset page is not on the
// Supabase project's allowed redirect list, Supabase sends the link to the
// Site URL (the home page) instead, which left people signed in on the home
// page with no way to choose a new password. This runs before any page loads
// and moves such a link to the reset page, keeping its tokens in the address
// so the reset page can read them. Nothing else is changed or stored.
export const recoveryRedirectScript = `(function(){try{var h=location.hash||'';if(location.pathname!=='/reset-password'&&/(^#|&)type=recovery(&|$)/.test(h)){location.replace('/reset-password'+h)}}catch(e){}})()`
