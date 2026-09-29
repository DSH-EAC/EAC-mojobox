import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { generateSite } from './build-site.mjs'

const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mojobox-build-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const save = async (path, value) => {
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), typeof value === 'string' ? value : JSON.stringify(value))
  }
  await mkdir(join(root, 'catalog/evidence'), { recursive: true })
  await save('distribution.json', { packCategories: ['function'] })
  await save('spec-revisions.json', {})
  for (const category of ['function', 'appearance', 'unclassified']) {
    const id = `org.example.${category}`
    const bytes = Buffer.from(`fake artifact: ${category}`)
    const artifactDigest = digest(bytes)
    const manifest = { id, name: id, version: '1.0.0', artifact: { digest: artifactDigest, path: 'https://invalid.example/artifact.tgz' } }
    const manifestPath = `catalog/plugins/${id}.json`
    const manifestBytes = JSON.stringify(manifest)
    await save(manifestPath, manifestBytes)
    // Deliberately cache only the published artifact: a filtered pack must never fetch.
    if (category === 'function') await save(`.cache/artifacts/${artifactDigest.slice(7)}`, bytes.toString())
    await save(`catalog/packs/${id}.pack.json`, {
      metadata: { id, version: '1.0.0', name: id, ...(category === 'unclassified' ? {} : { category }) },
      components: [{ id, version: '1.0.0', required: true }]
    })
    await save(`catalog/packs/${id}.lock.json`, {
      pack: `${id}@1.0.0`,
      components: [{ id, version: '1.0.0', manifest: manifestPath, manifestDigest: digest(manifestBytes), artifactDigest }]
    })
    if (category === 'function') {
      await save('catalog/evidence/current.json', { subject: { id, version: '1.0.0', artifactDigest }, manifestDigest: digest(manifestBytes) })
      await save('catalog/evidence/historical.json', { subject: { id, version: '0.9.0', artifactDigest }, manifestDigest: digest(manifestBytes) })
    }
  }
  return { root, save, output: join(root, 'site/public/generated') }
}

test('publication filters packs, manifests and downloads; archives are reproducible and described by real bytes', async t => {
  const { root, output } = await fixture(t)
  const first = await generateSite(root)
  assert.deepEqual(first.packs.map(pack => pack.metadata.id), ['org.example.function'])
  assert.deepEqual(first.plugins.map(plugin => plugin.id), ['org.example.function'])
  assert.equal(first.plugins[0].evidence.length, 1)
  assert.deepEqual(await readdir(join(output, 'manifests')), ['org.example.function.json'])
  assert.deepEqual(await readdir(join(output, 'packs')), ['org.example.function.lock.json', 'org.example.function.pack.json'])
  assert.deepEqual(await readdir(join(output, 'downloads')), ['org.example.function-1.0.0.dshpack'])
  const archive = await readFile(join(root, 'site/public', first.packs[0].archiveUrl))
  assert.equal(first.packs[0].archiveSize, archive.length)
  assert.equal(first.packs[0].archiveDigest, digest(archive))
  // ZIP local headers expose entry names even though entry bodies are compressed.
  assert.ok(archive.includes(Buffer.from('pack.json')))
  assert.ok(archive.includes(Buffer.from('pack.lock.json')))
  assert.ok(archive.includes(Buffer.from('objects/sha256/')))
  const second = await generateSite(root)
  assert.equal(second.packs[0].archiveDigest, first.packs[0].archiveDigest)
})

test('pack removal also removes stale public artifacts', async t => {
  const { root, output, save } = await fixture(t)
  await generateSite(root)
  await save('catalog/packs/org.example.function.pack.json', { metadata: { id: 'org.example.function', category: 'appearance' }, components: [] })
  const catalog = await generateSite(root)
  assert.equal(catalog.packs.length, 0)
  assert.deepEqual(await readdir(join(output, 'manifests')), [])
  await assert.rejects(readFile(join(output, 'downloads/org.example.function-1.0.0.dshpack')), { code: 'ENOENT' })
})

test('archive creation rejects manifest and Lock artifact digest mismatches', async t => {
  const { root, save } = await fixture(t)
  const path = 'catalog/packs/org.example.function.lock.json'
  const lock = JSON.parse(await readFile(join(root, path), 'utf8'))
  const original = lock.components[0].manifestDigest
  lock.components[0].manifestDigest = `sha256:${'0'.repeat(64)}`
  await save(path, lock)
  await assert.rejects(generateSite(root), /Manifest digest mismatch/)
  lock.components[0].manifestDigest = original
  lock.components[0].artifactDigest = `sha256:${'0'.repeat(64)}`
  await save(path, lock)
  await assert.rejects(generateSite(root), /Lock artifact digest mismatch/)
})

test('unknown publication categories fail before replacing generated output', async t => {
  const { root, output, save } = await fixture(t)
  await generateSite(root)
  await save('distribution.json', { packCategories: ['typo'] })
  await assert.rejects(generateSite(root), /packCategories/)
  assert.ok(await readFile(join(output, 'catalog.json')))
})
