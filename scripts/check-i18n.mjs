// Checks every translation against English: missing or extra keys, empty
// strings, and placeholders ({name}) that differ from the English text.
// Run: node scripts/check-i18n.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const dir = join(dirname(fileURLToPath(import.meta.url)), '../lib/i18n/locales')

function load(file) {
  // Strip the TypeScript-only lines and evaluate the object literal.
  const src = readFileSync(join(dir, file), 'utf8')
    .replace(/^import .*$/gm, '')
    .replace(/^export default \w+\s*$/m, '')
    .replace(/^const (\w+)(:[^=]+)? =/m, 'result =')
  const ctx = { result: null }
  vm.runInNewContext(src, ctx)
  return ctx.result
}

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out[key] = v
    else flatten(v, key, out)
  }
  return out
}

const vars = s => (s.match(/\{\w+\}/g) || []).sort().join(',')
const en = flatten(load('en.ts'))
let problems = 0
for (const file of readdirSync(dir).filter(f => f !== 'en.ts' && f.endsWith('.ts'))) {
  const tr = flatten(load(file))
  const report = []
  for (const k of Object.keys(en)) {
    if (!(k in tr)) report.push(`missing ${k}`)
    else if (!tr[k].trim()) report.push(`empty ${k}`)
    else if (vars(tr[k]) !== vars(en[k])) report.push(`placeholders differ in ${k}: "${tr[k]}"`)
  }
  for (const k of Object.keys(tr)) if (!(k in en)) report.push(`unknown key ${k}`)
  console.log(`${file}: ${Object.keys(tr).length}/${Object.keys(en).length} keys${report.length ? '' : ', OK'}`)
  report.forEach(r => console.log('  ' + r))
  problems += report.length
}
process.exit(problems ? 1 : 0)
