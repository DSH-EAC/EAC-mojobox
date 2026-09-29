import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFile, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const evidenceFile = 'catalog/evidence/dev.omdsh.dsh-better-sidebar-0.12.2.parsed.json'

async function fixture(t) {
  const cache = join(repositoryRoot, '.cache')
  await mkdir(cache, { recursive: true })
  const root = await mkdtemp(join(cache, 'validator-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'scripts'))
  await cp(join(repositoryRoot, 'scripts/validate.mjs'), join(root, 'scripts/validate.mjs'))
  await Promise.all(['schemas', 'fixtures', 'catalog', 'profiles', 'vendor', 'spec-revisions.json', 'evidence-suites.json']
    .map(path => cp(join(repositoryRoot, path), join(root, path), { recursive: true })))
  return root
}

async function update(root, path, edit) {
  const file = join(root, path)
  const value = JSON.parse(await readFile(file, 'utf8'))
  edit(value)
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
}

function run(root) {
  const result = spawnSync(process.execPath, ['scripts/validate.mjs'], { cwd: root, encoding: 'utf8' })
  assert.ifError(result.error)
  return result
}

test('rejects repeated Lock components even when count still matches the Pack', async t => {
  const root = await fixture(t)
  await update(root, 'catalog/packs/dev.mojobox.focus-kit.lock.json', lock => {
    assert.equal(lock.components.length, 2)
    lock.components[1] = lock.components[0]
  })
  const result = run(root)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /contains duplicate components/)
})

test('historical suite remains valid when current validator bytes change', async t => {
  const root = await fixture(t)
  await appendFile(join(root, 'scripts/validate.mjs'), '\n// Unrelated implementation update.\n')
  const result = run(root)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Validated 18 plugins/)
})

test('rejects a tampered historical suite digest', async t => {
  const root = await fixture(t)
  await update(root, evidenceFile, evidence => { evidence.suite.digest = `sha256:${'0'.repeat(64)}` })
  const result = run(root)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /suite digest mismatch/)
})

test('retains old-version evidence without treating its digests as current claims', async t => {
  const root = await fixture(t)
  await update(root, evidenceFile, evidence => {
    evidence.subject.version = '0.1.0'
    evidence.subject.artifactDigest = `sha256:${'1'.repeat(64)}`
    evidence.manifestDigest = `sha256:${'2'.repeat(64)}`
  })
  const result = run(root)
  assert.equal(result.status, 0, result.stderr)
})

for (const field of ['artifactDigest', 'manifestDigest']) {
  test(`rejects a current-version ${field} mismatch`, async t => {
    const root = await fixture(t)
    await update(root, evidenceFile, evidence => {
      if (field === 'artifactDigest') evidence.subject.artifactDigest = `sha256:${'0'.repeat(64)}`
      else evidence.manifestDigest = `sha256:${'0'.repeat(64)}`
    })
    const result = run(root)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, field === 'artifactDigest' ? /artifact digest mismatch/ : /Manifest digest mismatch/)
  })
}

for (const kind of ['plugin', 'Pack']) {
  test(`rejects a ${kind} filename that differs from its declared id`, async t => {
    const root = await fixture(t)
    const path = kind === 'plugin'
      ? 'catalog/plugins/dev.omdsh.dsh-better-sidebar.json'
      : 'catalog/packs/dev.mojobox.focus-kit.pack.json'
    const renamed = kind === 'plugin'
      ? 'catalog/plugins/org.example.renamed.json'
      : 'catalog/packs/org.example.renamed.pack.json'
    await rename(join(root, path), join(root, renamed))
    if (kind === 'Pack') {
      await rename(join(root, path.replace('.pack.json', '.lock.json')), join(root, renamed.replace('.pack.json', '.lock.json')))
    }
    const result = run(root)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, new RegExp(`filename must match ${kind} id`))
  })
}
