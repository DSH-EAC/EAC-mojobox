import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import test from 'node:test'
import { ZipArchive } from 'archiver'
import tar from 'tar-stream'
import { planOfficialPack, installOfficialPack } from '../adapters/official-cli.mjs'
import { inspectPack } from './inspect-pack.mjs'

const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const json = value => JSON.stringify(value)
async function save(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, typeof value === 'string' ? value : json(value))
}

async function fixture(t, { metadata, cliBody } = {}) {
  const home = await mkdtemp(join(tmpdir(), 'mojobox-cli-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const profile = 'testing'
  const profilePath = join(home, 'profiles', profile)
  await save(join(profilePath, 'package.json'), { dependencies: {}, dsh: { profile: { bundles: [] } } })
  const manifest = JSON.parse(await readFile(new URL('../fixtures/valid/plugin-official-package-metadata.json', import.meta.url)))
  const packageJson = metadata || { name: manifest.name, version: manifest.version, dsh: { bundle: { patch: 'patch.yml' } } }
  const packer = tar.pack()
  packer.entry({ name: 'package/package.json' }, json(packageJson))
  packer.entry({ name: 'package/patch.yml' }, '{}')
  packer.finalize()
  const chunks = []
  for await (const chunk of packer) chunks.push(chunk)
  const artifact = gzipSync(Buffer.concat(chunks))
  manifest.artifact = { digest: hash(artifact), algorithm: 'sha256', path: 'https://example.org/fixture.tgz' }
  const pack = JSON.parse(await readFile(new URL('../fixtures/valid/pack.json', import.meta.url)))
  pack.components = [{ id: manifest.id, version: manifest.version, required: true }]
  const lock = JSON.parse(await readFile(new URL('../fixtures/valid/pack-lock.json', import.meta.url)))
  lock.components = [{ id: manifest.id, version: manifest.version, source: `npm:${manifest.name}@${manifest.version}`,
    manifest: `catalog/plugins/${manifest.id}.json`, manifestDigest: hash(json(manifest)), artifactDigest: hash(artifact) }]
  const archive = join(home, 'fixture.dshpack')
  await new Promise((accept, reject) => {
    const output = createWriteStream(archive)
    const zip = new ZipArchive()
    output.on('close', accept)
    output.on('error', reject)
    zip.on('error', reject)
    zip.pipe(output)
    for (const [name, bytes] of [['pack.json', json(pack)], ['pack.lock.json', json(lock)],
      [`objects/sha256/${hash(json(manifest)).slice(7)}`, json(manifest)], [`objects/sha256/${hash(artifact).slice(7)}`, artifact]]) zip.append(bytes, { name })
    zip.finalize()
  })
  const cli = join(home, 'fake-cli/lib/bin.js')
  await save(join(home, 'fake-cli/package.json'), { name: '@deepseek-ai/dsh', version: '0.1.7-alpha.1', type: 'module', bin: { dsh: 'lib/bin.js' } })
  await save(cli, cliBody || `import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const args = process.argv.slice(2);
if (args[0] !== 'plugin' || args[1] !== '--profile' || args[3] !== 'add' || !args[4].startsWith('file:')) process.exit(9);
const path = join(process.env.DSH_HOME, 'profiles', args[2]);
const config = JSON.parse(await readFile(join(path, 'package.json')));
config.dependencies['@example/official-package'] = args[4];
config.dsh.profile.bundles.push('@example/official-package');
await writeFile(join(path, 'package.json'), JSON.stringify(config));
await mkdir(join(path, 'node_modules/@example/official-package'), {recursive:true});
await writeFile(join(path, 'node_modules/@example/official-package/package.json'), JSON.stringify({name:'@example/official-package',version:'1.2.3'}));`)
  return { home, profile, profilePath, cli, archive, inspection: await inspectPack(archive), confirm: true }
}

function allowFakeCli(t) {
  // Only the local test double is spawned; it does not depend on import.meta.main.
  const descriptor = Object.getOwnPropertyDescriptor(process.versions, 'node')
  Object.defineProperty(process.versions, 'node', { ...descriptor, value: '24.0.0' })
  t.after(() => Object.defineProperty(process.versions, 'node', descriptor))
}

test('planning missing components is read-only and marks add', async t => {
  const options = await fixture(t)
  const before = await readFile(join(options.profilePath, 'package.json'))
  const plan = await planOfficialPack(options.inspection, options)
  assert.equal(plan.components[0].action, 'add')
  assert.deepEqual(await readFile(join(options.profilePath, 'package.json')), before)
  assert.equal((await readdir(options.home)).includes('mojobox'), false)
})

for (const [source, version, expected] of [['^1.2.3', '1.2.3', 'keep'], ['1.2.3', '2.0.0', 'blocked'], ['file:../custom', '1.2.3', 'blocked'], ['git+https://example.org/plugin.git', '1.2.3', 'blocked'], ['link:../local', '1.2.3', 'blocked']]) {
  test(`plans ${source} installed ${version} as ${expected} while preserving disabled state`, async t => {
    const options = await fixture(t)
    const name = options.inspection.components[0].name
    await save(join(options.profilePath, 'package.json'), { dependencies: { [name]: source }, dsh: { profile: { bundles: [] } } })
    await save(join(options.profilePath, 'node_modules', name, 'package.json'), { name, version })
    const plan = await planOfficialPack(options.inspection, options)
    assert.equal(plan.components[0].action, expected)
    assert.equal(plan.components[0].enabled, false)
  })
}

test('rejects absent, traversal, desktop and missing profiles', async t => {
  const options = await fixture(t)
  for (const profile of [undefined, '../outside', 'desktop', 'Desktop', 'missing']) await assert.rejects(planOfficialPack(options.inspection, { ...options, profile }))
})

test('blocks unsupported capabilities and platforms before writes', async t => {
  const options = await fixture(t)
  for (const requires of [{ hostCapabilities: ['host.snapshot'] }, { platforms: [{ os: 'unavailable' }] }]) {
    const plan = await planOfficialPack({ ...options.inspection, requires }, options)
    assert.equal(plan.blocked, true)
    assert.equal(plan.components[0].action, 'blocked')
  }
  assert.equal((await readdir(options.home)).includes('mojobox'), false)
})

test('requires explicit confirmation and exact CLI version', async t => {
  const options = await fixture(t)
  await assert.rejects(installOfficialPack(options.archive, { ...options, confirm: false }), /confirmation/)
  await save(join(options.home, 'fake-cli/package.json'), { name: '@deepseek-ai/dsh', version: '0.1.6', bin: { dsh: 'lib/bin.js' } })
  await assert.rejects(installOfficialPack(options.archive, options), /Only the official/)
  assert.equal((await readdir(options.home)).includes('mojobox'), false)
})

test('blocks duplicate npm identities even when catalog IDs differ', async t => {
  const options = await fixture(t)
  options.inspection.components.push({ ...options.inspection.components[0], id: 'org.example.duplicate' })
  const plan = await planOfficialPack(options.inspection, options)
  assert.equal(plan.blocked, true)
  assert.ok(plan.components.every(item => item.action === 'blocked'))
})

test('CLI plan is read-only and install without confirmation fails', async t => {
  const options = await fixture(t)
  const entry = new URL('../adapters/official-cli.mjs', import.meta.url)
  const { fileURLToPath } = await import('node:url')
  const args = [fileURLToPath(entry), 'plan', options.archive, '--home', options.home, '--profile', options.profile]
  const plan = spawnSync(process.execPath, args, { encoding: 'utf8' })
  assert.equal(plan.status, 0, plan.stderr)
  assert.equal(JSON.parse(plan.stdout).components[0].action, 'add')
  args[1] = 'install'
  const install = spawnSync(process.execPath, args, { encoding: 'utf8' })
  assert.equal(install.status, 1)
  assert.match(install.stderr, /confirmation/)
  assert.equal((await readdir(options.home)).includes('mojobox'), false)
})

test('rejects Node versions where the official CLI silently does nothing', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(process.versions, 'node')
  t.after(() => Object.defineProperty(process.versions, 'node', descriptor))
  const options = await fixture(t)
  for (const version of ['22.17.0', '23.0.0']) {
    Object.defineProperty(process.versions, 'node', { ...descriptor, value: version })
    await assert.rejects(installOfficialPack(options.archive, options), /Node.js 22.19/)
  }
  assert.equal((await readdir(options.home)).includes('mojobox'), false)
})

test('installs through the explicit fake CLI, then keeps its stored file source without re-enabling', async t => {
  allowFakeCli(t)
  const options = await fixture(t)
  assert.equal((await installOfficialPack(options.archive, options)).status, 'complete')
  const config = JSON.parse(await readFile(join(options.profilePath, 'package.json')))
  assert.ok(config.dependencies['@example/official-package'].startsWith('file:'))
  config.dsh.profile.bundles = []
  await save(join(options.profilePath, 'package.json'), config)
  const again = await installOfficialPack(options.archive, options)
  assert.equal(again.results[0].status, 'kept')
  assert.deepEqual(JSON.parse(await readFile(join(options.profilePath, 'package.json'))).dsh.profile.bundles, [])
})

for (const cliBody of ['process.exit(3)', 'process.exit(0)']) {
  test(`reports CLI ${cliBody} as failed without claiming success`, async t => {
    allowFakeCli(t)
    const options = await fixture(t, { cliBody })
    const result = await installOfficialPack(options.archive, options)
    assert.equal(result.status, 'partial-failure')
    assert.equal(result.results[0].status, 'failed')
  })
}

for (const metadata of [{ name: 'wrong', version: '1.2.3', dsh: { bundle: { patch: 'patch.yml' } } }, { name: '@example/official-package', version: '1.2.3' }]) {
  test(`rejects tgz identity or missing plugin declaration: ${json(metadata)}`, async t => {
    allowFakeCli(t)
    const options = await fixture(t, { metadata })
    await assert.rejects(installOfficialPack(options.archive, options), /locked npm name\/version/)
    assert.deepEqual(JSON.parse(await readFile(join(options.profilePath, 'package.json'))).dependencies, {})
  })
}
