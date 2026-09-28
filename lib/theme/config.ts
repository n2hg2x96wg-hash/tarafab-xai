// Shared by the server layout and the client provider. Must not be a
// 'use client' module, or the server receives references instead of values.
export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'tarafab.theme'
export const THEME_COOKIE = 'tarafab_theme'

export function isThemePreference(v: unknown): v is ThemePreference {
  return v === 'system' || v === 'light' || v === 'dark'
}

// Runs in <head> before the page paints, so the saved theme is applied with
// no flash. Kept tiny and dependency-free; any error leaves the dark default.
export const themeInitScript = `(function(){try{var k='${THEME_STORAGE_KEY}',p=null;try{p=localStorage.getItem(k)}catch(e){}
if(p!=='light'&&p!=='dark'&&p!=='system'){var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark|system)/);p=m?m[1]:'dark'}
var r=p==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):p;
document.documentElement.setAttribute('data-theme',r)}catch(e){}})()`
