/**
 * Extract the Fairy mascot artwork out of the installed dsh-fairy-visual client
 * bundle and emit it as a standalone ES module the desktop pet window can use
 * with no dependency on the web GUI.
 *
 * The bundle is a tsdown/rolldown build:
 *   - every source file sits in a `//#region <name>` block;
 *   - bundled CommonJS modules are declared as
 *     `var require_<name> = __commonJSMin(((exports, module) => { ... }));`
 *   - ESM-runtime helpers are declared as `var init_<name> = __esmMin(...)`,
 *     where `init_x` and `require_x` are two names for the same factory.
 *
 * We recover every module, bind each body's sibling calls, evaluate the few
 * modules the mascot needs, and emit their real output (scene graph, effect
 * layers, animation stylesheet).
 *
 * Usage: node tools/extract-pet.mjs [path-to-client.js] [out-file]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_SOURCE =
  'C:/Users/User/.dsh/profiles/web/node_modules/dsh-fairy-visual/lib/client.js'
const source = resolve(process.argv[2] ?? DEFAULT_SOURCE)
const outFile = resolve(process.argv[3] ?? resolve(HERE, '../pet/fairy-assets.mjs'))

const text = readFileSync(source, 'utf8')
const lines = text.split(/\r?\n/)

/** A module declaration: `var require_x = <optional annotation> __commonJSMin(`. */
const DECLARATION = /var\s+(require_[A-Za-z0-9_]+)\s*=[^;]{0,90}?__commonJSMin\(/g

/** Any sibling-module call: `require_x()` (CommonJS) or `init_x()` (ESM runtime). */
const SIBLING_CALL = /\b((?:require|init)_[A-Za-z0-9_]+)\s*\(\)/g

/** Factory name of a sibling helper, since `init_x` and `require_x` are aliases. */
function factoryOf(helper) {
  return helper.startsWith('require_') ? helper : 'require_' + helper.replace(/^init_/, '')
}

/** Every module factory name declared anywhere in `chunk`. */
function collectFactories(chunk) {
  return new Set([...chunk.matchAll(/var\s+(require_[A-Za-z0-9_]+)\s*=/g)].map((m) => m[1]))
}

/** Every sibling helper called anywhere in `chunk`. */
function collectCalls(chunk) {
  return new Set([...chunk.matchAll(SIBLING_CALL)].map((m) => m[1]))
}

/** Walk from an opening brace to its matching close, ignoring nesting depth. */
function matchBrace(chunk, braceAt) {
  let depth = 0
  for (let i = braceAt; i < chunk.length; i += 1) {
    const ch = chunk[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Turn every module declaration in `chunk` into an evaluable CommonJS body,
 * prefixed with bindings for the sibling helpers it calls.
 * @returns Map of factory name -> { code, where }
 */
function collectModules(chunk, where, dependencies, factories) {
  const found = new Map()
  for (const match of chunk.matchAll(DECLARATION)) {
    const name = match[1]
    const wrapperAt = chunk.indexOf('__commonJSMin(', match.index)
    const braceAt = chunk.indexOf('{', wrapperAt)
    if (wrapperAt === -1 || braceAt === -1) throw new Error(`${name}: wrapper body not found`)
    const end = matchBrace(chunk, braceAt)
    if (end === -1) throw new Error(`${name}: unbalanced wrapper braces`)
    const inner = chunk.slice(braceAt + 1, end)
    const prelude = []
    for (const helper of dependencies) {
      const factory = factoryOf(helper)
      // A module must never bind its own name: that shadows its own factory.
      if (factory === name) continue
      if (!factories.has(factory)) continue
      prelude.push(`var ${helper} = () => requireFactory('${factory}')`)
    }
    found.set(name, {
      code: `module.exports = (() => {\n${prelude.join('\n')}\n${inner}\n})();\n`,
      where,
    })
  }
  return found
}

/** Locate every `//#region <name>` block and the line span of its body. */
const regions = []
for (let i = 0; i < lines.length; i += 1) {
  const match = /^\/\/#region\s+(\S+)/.exec(lines[i])
  if (match) regions.push({ name: match[1], from: i + 1, to: lines.length })
}
for (let i = 0; i < regions.length - 1; i += 1) regions[i].to = regions[i + 1].from

const chunks = [{ region: 'prologue', body: lines.slice(0, regions.length ? regions[0].from - 1 : lines.length).join('\n') }]
for (const region of regions) {
  chunks.push({ region: region.name, body: lines.slice(region.from, region.to).join('\n') })
}

// Discover every factory and every sibling call up front: a module body can
// call a sibling that is declared in a completely different region.
const factories = new Set(chunks.flatMap((chunk) => [...collectFactories(chunk.body)]))
const dependencies = new Set(chunks.flatMap((chunk) => [...collectCalls(chunk.body)]))

const modules = new Map()
for (const chunk of chunks) {
  for (const [name, entry] of collectModules(chunk.body, chunk.region, dependencies, factories)) {
    modules.set(name, entry)
  }
}

if (modules.size === 0) throw new Error('no bundled modules found in bundle')
if (dependencies.size === 0) throw new Error('no sibling module calls found')

if (process.env.DSH_EXTRACT_DEBUG === '1') {
  const entry = modules.get('require_mascot_geometry')
  console.error('GEOM where=' + entry.where + ' chars=' + entry.code.length)
  console.error('GEOM hasExport=' + entry.code.includes('module.exports = Object.freeze'))
  console.error('GEOM tail=' + JSON.stringify(entry.code.slice(-220)))
}

/** Evaluate one module, memoised, resolving dependencies through the registry. */
const cache = new Map()
const active = new Set()
function load(name) {
  if (cache.has(name)) return cache.get(name)
  const entry = modules.get(name)
  if (entry === undefined) throw new Error(`unknown bundled module: ${name}`)
  if (active.has(name)) throw new Error(`circular bundled module: ${name}`)
  active.add(name)
  const mod = { exports: {} }
  const require = (spec) => {
    const key = String(spec)
    if (!modules.has(key)) throw new Error(`${entry.where}: unexpected require(${key})`)
    return load(key)
  }
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', 'requireFactory', entry.code)(
    mod,
    mod.exports,
    require,
    requireFactory,
  )
  active.delete(name)
  cache.set(name, mod.exports)
  return mod.exports
}

/**
 * Resolve the value a prelude binding should produce. In the bundle these
 * helpers are module factories that return nothing and populate `module.exports`
 * by reference, so the caller reads the namespace through the shared exports
 * object. We evaluate the module on demand and hand back that namespace.
 */
function requireFactory(name) {
  const value = load(name)
  if (process.env.DSH_EXTRACT_DEBUG === '1') {
    const keys = value === null || typeof value !== 'object' ? null : Object.keys(value).length
    console.error(`FACTORY ${name} -> ${typeof value} keys=${keys} empty=${!keys}`)
  }
  return value
}

const geometry = load('require_mascot_geometry')
const effects = load('require_mascot_effects_svg')
const eye = load('require_mascot_eye_svg')
const style = load('require_mascot_style')

const pick = (value, label) => {
  if (typeof value !== 'string' || value.length < 40) {
    throw new Error(`${label}: expected a non-trivial string, got ${typeof value}`)
  }
  return value
}

const MASCOT_SVG = pick(eye.SVG ?? eye, 'mascot-eye-svg')
const PULSE_SVG = pick(effects.PULSE_SVG, 'pulse svg')
const HALO_SVG = pick(effects.HALO_SVG, 'halo svg')
const MASCOT_CSS = pick(style.CSS ?? style, 'mascot-style')

const banner = `/**
 * GENERATED FILE - do not edit by hand.
 * Source: dsh-fairy-visual lib/client.js (installed at
 * C:/Users/User/.dsh/profiles/web/node_modules/dsh-fairy-visual)
 * Regenerate with: node tools/extract-pet.mjs
 *
 * The Fairy mascot scene graph, its halo/pulse layers, and its animation
 * stylesheet, extracted verbatim so the desktop pet renders the same
 * character and motion as the in-GUI Fairy.
 */`

const out = `${banner}
export const geometry = ${JSON.stringify(geometry, null, 2)}

export const PULSE_SVG = ${JSON.stringify(PULSE_SVG)}

export const HALO_SVG = ${JSON.stringify(HALO_SVG)}

export const MASCOT_SVG = ${JSON.stringify(MASCOT_SVG)}

export const MASCOT_CSS = ${JSON.stringify(MASCOT_CSS)}
`

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, out, 'utf8')

console.log(
  JSON.stringify(
    {
      out: outFile,
      bytes: out.length,
      moduleCount: modules.size,
      dependencyCount: dependencies.size,
      geometryKeys: Object.keys(geometry).length,
      svgBytes: MASCOT_SVG.length,
      pulseBytes: PULSE_SVG.length,
      haloBytes: HALO_SVG.length,
      cssBytes: MASCOT_CSS.length,
      keyframes: [...MASCOT_CSS.matchAll(/@keyframes\s+([A-Za-z0-9_-]+)/g)].map((m) => m[1]),
    },
    null,
    2,
  ),
)
