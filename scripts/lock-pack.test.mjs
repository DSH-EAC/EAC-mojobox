import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { generatePackLock } from './lock-pack.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packFile = 'catalog/packs/org.example.tools.pack.json'
const pluginFile = 'catalog/plugins/org.example.tool.json'
const lockFile = 'catalog/packs/org.example.tools.lock.json'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mojobox-lock-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'catalog/packs'), { recursive: true })
  await mkdir(join(root, 'catalog/plugins'), { recursive: true })
  await cp(join(repositoryRoot, 'schemas'), join(root, 'schemas'), { recursive: true })
  const pack = {
    $schema: 'https://mojobox.dev/schemas/pack-v1alpha1.json',
    apiVersion: 'packs.mojobox.dev/v1alpha1',
    kind: 'Pack',
    metadata: { id: 'org.example.tools', version: '1.0.0', name: 'Tools', description: 'Tools' },
    components: [{ id: 'org.example.tool', version: '1.2.3', required: true }]
  }
  const plugin = {
    id: 'org.example.tool', name: '@example/tool', version: '1.2.3',
    artifact: { path: 'https://registry.npmjs.org/@example/tool/-/tool-1.2.3.tgz', digest: `sha256:${'a'.repeat(64)}` }
  }
  await writeFile(join(root, packFile), JSON.stringify(pack))
  await writeFile(join(root, pluginFile), `${JSON.stringify(plugin, null, 2)}\r\n`)
  return { root, pack, plugin }
}

test('locks exact catalog versions and original manifest bytes deterministically', async t => {
  const { root, plugin } = await fixture(t)
  const before = await readFile(join(root, pluginFile))
  const { lock } = await generatePackLock(packFile, { root })
  assert.equal(lock.pack, 'org.example.tools@1.0.0')
  assert.deepEqual(lock.components[0], {
    id: plugin.id, version: plugin.version, source: 'npm:@example/tool@1.2.3', manifest: pluginFile,
    manifestDigest: `sha256:${createHash('sha256').update(before).digest('hex')}`,
    artifactDigest: plugin.artifact.digest
  })
  const first = await readFile(join(root, lockFile))
  await generatePackLock(packFile, { root })
  assert.deepEqual(await readFile(join(root, lockFile)), first)
  assert.deepEqual(await readFile(join(root, pluginFile)), before)
})

test('existing production packs produce their current locks without writing', async () => {
  const path = 'catalog/packs/dev.mojobox.focus-kit.pack.json'
  const { lock } = await generatePackLock(path, { write: false })
  const existing = JSON.parse(await readFile(join(repositoryRoot, path.replace('.pack.json', '.lock.json')), 'utf8'))
  assert.deepEqual(lock, existing)
})

for (const scenario of ['floating', 'missing', 'mismatch', 'duplicate', 'unpublished', 'invalid-digest']) {
  test(`rejects ${scenario} before replacing an existing lock`, async t => {
    const { root, pack, plugin } = await fixture(t)
    if (scenario === 'floating') pack.components[0].version = 'latest'
    if (scenario === 'missing') pack.components[0].id = 'org.example.missing'
    if (scenario === 'mismatch') pack.components[0].version = '2.0.0'
    if (scenario === 'duplicate') pack.components.push(pack.components[0])
    if (scenario === 'unpublished') delete plugin.artifact
    if (scenario === 'invalid-digest') plugin.artifact.digest = 'not-a-digest'
    await writeFile(join(root, packFile), JSON.stringify(pack))
    await writeFile(join(root, pluginFile), JSON.stringify(plugin))
    await writeFile(join(root, lockFile), 'existing lock')
    await assert.rejects(generatePackLock(packFile, { root }))
    assert.equal(await readFile(join(root, lockFile), 'utf8'), 'existing lock')
  })
}

test('rejects paths outside catalog/packs', async t => {
  const { root } = await fixture(t)
  for (const path of ['../../escape.pack.json', 'catalog/escape.pack.json', 'catalog/packs/../escape.pack.json', 'catalog/packs/file.json']) {
    await assert.rejects(generatePackLock(path, { root }), /directly inside catalog\/packs/)
  }
})

test('rejects a lock destination redirected by a symlink', async t => {
  const { root } = await fixture(t)
  const target = join(root, 'outside.json')
  await writeFile(target, 'untouched')
  try {
    await symlink(target, join(root, lockFile), 'file')
  } catch (error) {
    if (error.code === 'EPERM') return t.skip('Creating file symlinks requires Windows privileges')
    throw error
  }
  await assert.rejects(generatePackLock(packFile, { root }), /regular file/)
  assert.equal(await readFile(target, 'utf8'), 'untouched')
})

test('rejects a redirected catalog/packs directory', async t => {
  const { root } = await fixture(t)
  const packs = join(root, 'catalog/packs')
  const target = join(root, 'other-packs')
  await cp(packs, target, { recursive: true })
  await rm(packs, { recursive: true })
  await symlink(target, packs, process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(generatePackLock(packFile, { root }), /must not redirect/)
})
