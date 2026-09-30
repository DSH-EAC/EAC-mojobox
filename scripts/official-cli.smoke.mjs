// Explicit opt-in smoke: installs only a synthetic bundle into a new isolated home.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import tar from 'tar-stream'
import { ZipArchive } from 'archiver'
import { inspectPack } from './inspect-pack.mjs'
import { planOfficialPack, installOfficialPack } from '../adapters/official-cli.mjs'

const cli = process.argv[2]
if (!cli) throw new Error('Usage: node scripts/official-cli.smoke.mjs <dsh/lib/bin.js>')
const cache = resolve('.cache')
await mkdir(cache, { recursive: true })
const root = await mkdtemp(join(cache, 'official-smoke-'))
const home = join(root, 'home')
const profile = 'mojobox-smoke'
const profileDir = join(home, 'profiles', profile)
await mkdir(profileDir, { recursive: true })
const profileFile = join(profileDir, 'package.json')
await writeFile(profileFile, JSON.stringify({ name: 'mojobox-isolated-smoke', private: true,
  dependencies: {}, dsh: { profile: { bundles: [] } } }))
const name = 'mojobox-smoke-bundle'
const pkg = { name, version: '1.0.0', dsh: { manifestVersion: 1, bundle: { patch: 'cordis.patch.yml' } } }
const archive = tar.pack()
const chunks = []
const collected = (async () => { for await (const chunk of archive) chunks.push(chunk) })()
archive.entry({ name: 'package/package.json' }, JSON.stringify(pkg))
archive.entry({ name: 'package/cordis.patch.yml' }, '[]\n')
archive.finalize()
await collected
const artifact = gzipSync(Buffer.concat(chunks))
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const manifest = JSON.parse(await readFile(new URL('../fixtures/valid/plugin-official-package-metadata.json', import.meta.url)))
manifest.id = 'org.example.smoke'
manifest.name = name
manifest.version = pkg.version
manifest['x-mojobox-package'] = { dsh: pkg.dsh }
manifest.artifact = { algorithm: 'sha256', digest: digest(artifact), path: 'https://example.invalid/smoke.tgz' }
const manifestBytes = Buffer.from(JSON.stringify(manifest))
const pack = JSON.parse(await readFile(new URL('../fixtures/valid/pack.json', import.meta.url)))
pack.metadata.id = 'org.example.smoke-pack'
pack.metadata.category = 'function'
pack.components = [{ id: manifest.id, version: manifest.version, required: true }]
const lock = JSON.parse(await readFile(new URL('../fixtures/valid/pack-lock.json', import.meta.url)))
lock.pack = `${pack.metadata.id}@${pack.metadata.version}`
lock.components = [{ id: manifest.id, version: manifest.version, source: `npm:${name}@${pkg.version}`,
  manifest: `catalog/plugins/${manifest.id}.json`, manifestDigest: digest(manifestBytes), artifactDigest: digest(artifact) }]
const file = join(root, 'smoke.dshpack')
await new Promise((resolveZip, reject) => {
  const output = createWriteStream(file)
  const zip = new ZipArchive()
  output.on('close', resolveZip)
  output.on('error', reject)
  zip.on('error', reject)
  zip.pipe(output)
  zip.append(JSON.stringify(pack), { name: 'pack.json' })
  zip.append(JSON.stringify(lock), { name: 'pack.lock.json' })
  zip.append(manifestBytes, { name: `objects/sha256/${digest(manifestBytes).slice(7)}` })
  zip.append(artifact, { name: `objects/sha256/${digest(artifact).slice(7)}` })
  zip.finalize()
})
const inspection = await inspectPack(file)
const before = await readFile(profileFile, 'utf8')
const plan = await planOfficialPack(inspection, { home, profile })
assert.equal(await readFile(profileFile, 'utf8'), before, 'Planning must not modify the profile')
console.log('Initial plan:', JSON.stringify(plan))
const result = await installOfficialPack(file, { home, profile, cli: resolve(cli), confirm: true })
console.log('Install result:', JSON.stringify(result))
const installed = JSON.parse(await readFile(join(profileDir, 'node_modules', name, 'package.json')))
assert.equal(installed.version, '1.0.0')
let profileState = JSON.parse(await readFile(profileFile))
assert.ok(profileState.dsh.profile.bundles.includes(name), 'The official host must register the bundle')
assert.ok(profileState.dependencies[name].startsWith('file:'), 'Host must retain the local artifact source')
const afterInstall = await readFile(profileFile, 'utf8')
await installOfficialPack(file, { home, profile, cli: resolve(cli), confirm: true })
assert.equal(await readFile(profileFile, 'utf8'), afterInstall, 'Repeated installation must be a no-op')
profileState.dsh.profile.bundles = []
await writeFile(profileFile, JSON.stringify(profileState))
const disabled = await readFile(profileFile, 'utf8')
await installOfficialPack(file, { home, profile, cli: resolve(cli), confirm: true })
assert.equal(await readFile(profileFile, 'utf8'), disabled, 'Disabled bundles must remain disabled')
const report = { node: process.version, cli: resolve(cli), home, profile,
  passed: ['read-only-plan', 'local-artifact-install', 'bundle-registration', 'repeat-no-op', 'disabled-preserved'],
  limitation: 'Synthetic empty bundle only; no production plugin or UI behavior verified.' }
await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
