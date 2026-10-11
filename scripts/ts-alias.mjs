// Test-only: lets Node resolve the app's "@/..." imports (tsconfig paths)
// when running TypeScript sources with --experimental-strip-types.
import { register } from 'node:module'
register('data:text/javascript,' + encodeURIComponent(`
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import path from 'node:path'
const root = process.cwd()
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('@/')) {
    const base = path.join(root, spec.slice(2))
    for (const ext of ['.ts', '.tsx', '/index.ts']) if (existsSync(base + ext)) return next(pathToFileURL(base + ext).href, ctx)
  }
  return next(spec, ctx)
}`))
