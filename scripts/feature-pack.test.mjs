import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ZipArchive } from 'archiver'
import { digest, inspectFeaturePack, validateRecord } from './feature-pack.mjs'
import { buildCatalog } from './build-catalog.mjs'
import { verifyDownloads } from './verify-downloads.mjs'
import { createServer } from 'node:http'

const manifest = JSON.parse(await readFile(new URL('../fixtures/intake/valid.json', import.meta.url)))
const duplicate = JSON.parse(await readFile(new URL('../fixtures/intake/invalid-duplicate.json', import.meta.url)))
async function archive(value = manifest, extras = []) {
  const zip = new ZipArchive({ zlib: { level: 9 } })
  const chunks = []
  const done = new Promise((accept, reject) => {
    zip.on('data', chunk => chunks.push(chunk))
    zip.on('end', () => accept(Buffer.concat(chunks)))
    zip.on('error', reject)
  })
  for (const [name, bytes, options = {}] of [['pack.json', JSON.stringify(value)], ...extras]) {
    zip.append(bytes, { name, date: new Date('1980-01-01T00:00:00Z'), mode: 0o644, ...options })
  }
  await zip.finalize()
  return done
}
const recordFor = bytes => ({ format: 'eac-feature-pack-v1', id: manifest.id, version: manifest.version,
  category: 'function', source: 'https://example.org/test-only-release', author: manifest.author, license: manifest.license, sha256: digest(bytes) })

test('valid thin archive is checked offline without claiming resolved sources or runtime success', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('No network allowed') })
  const bytes = await archive()
  const report = await inspectFeaturePack(bytes, digest(bytes))
  assert.deepEqual(report.manifest, manifest)
  assert.equal(report.runtime, 'not-tested')
  assert.equal(report.references, 'not-resolved')
  assert.equal(report.size, bytes.length)
  validateRecord(recordFor(bytes))
  await assert.rejects(inspectFeaturePack(bytes, '0'.repeat(64)), /SHA-256 mismatch/)
})

test('invalid schema, duplicate refs, draft and unsupported payload are rejected', async () => {
  for (const [value, error] of [
    [{ ...manifest, formatVersion: 2 }, /Invalid Feature Pack/],
    [duplicate, /Duplicate plugin/],
    [{ ...manifest, plugins: [] }, /at least one/],
    [{ ...manifest, plugins: [{ ref: 'file:local.tgz' }] }, /Unsupported plugin reference/],
    [{ ...manifest, overrides: ['config'] }, /without overrides/],
    [{ ...manifest, skills: [{ id: 'test' }] }, /without overrides/],
    [{ ...manifest, 'x-eac': { status: 'draft', intendedPluginIds: [], conflictsPending: false } }, /Draft/]
  ]) await assert.rejects(inspectFeaturePack(await archive(value)), error)
})

test('unexpected files, duplicate entries, symlinks, missing icons and size limits are rejected', async () => {
  for (const [value, extras, error] of [
    [manifest, [['payload/skills/test/SKILL.md', 'test']], /Unsupported archive path/],
    [manifest, [['pack.json', '{}']], /Duplicate archive/],
    [manifest, [['icon.png', 'target', { type: 'symlink', linkname: 'target' }]], /Not a regular file/],
    [{ ...manifest, icon: 'icon.png' }, [], /Icon declaration/],
    [{ ...manifest, icon: 'icon.png' }, [['icon.png', 'not a PNG']], /PNG signature/],
    [manifest, [['icon.png', Buffer.alloc(512 * 1024 + 1)]], /Entry too large/]
  ]) await assert.rejects(inspectFeaturePack(await archive(value, extras)), error)
  await assert.rejects(inspectFeaturePack(Buffer.from('not a zip')))
  await assert.rejects(inspectFeaturePack(Buffer.alloc(2 * 1024 * 1024 + 1)), /Archive exceeds/)
})

test('intake metadata rejects unsupported formats, unsafe sources and fabricated digests', () => {
  const record = recordFor(Buffer.from('test'))
  for (const mutation of [{ format: 'unknown' }, { source: 'javascript:alert(1)' },
    { source: 'https://user:secret@example.org/file' }, { sha256: 'fake' }, { id: '../escape' },
    { category: 'full-environment' }, { category: undefined }]) {
    assert.throws(() => validateRecord({ ...record, ...mutation }))
  }
})

test('appearance intake records preserve loader metadata and reject it for other categories', () => {
  const record = { ...recordFor(Buffer.from('test')), category: 'appearance', appearance: {
    kind: 'skin',
    loader: { id: '@dsh-eac/ui-skin-loader', version: '1.1.0', source: 'https://github.com/DSH-EAC/dsh-ui-skin-loader' },
    skinIds: ['maid-atelier'], conflicts: ['bodyAttr:theme'], previews: ['https://example.org/preview.png']
  } }
  validateRecord(record)
  assert.throws(() => validateRecord({ ...record, category: 'function' }))
  assert.throws(() => validateRecord({ ...record, category: 'appearance', appearance: { loader: { id: 'loader', source: 'javascript:bad' } } }))
  assert.throws(() => validateRecord({ ...record, appearance: { ...record.appearance, loader: { ...record.appearance.loader, source: 'https://user:secret@example.org/loader' } } }))
})

test('traversal names in ZIP metadata are rejected without extracting files', async () => {
  const bytes = await archive()
  const malicious = Buffer.from(bytes)
  // Both local and central-directory names have the same byte length.
  let offset = 0
  while ((offset = malicious.indexOf(Buffer.from('pack.json'), offset)) !== -1) {
    malicious.write('../x.json', offset)
    offset += 9
  }
  await assert.rejects(inspectFeaturePack(malicious), /invalid relative path|Unsupported archive path/)
})

test('contributed archive is copied byte-for-byte; mismatch fails before replacing catalog; removal clears downloads', async t => {
  const root = await mkdtemp(join(tmpdir(), 'mojobox-intake-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'catalog/feature-packs'), { recursive: true })
  await mkdir(join(root, 'artifacts'))
  const bytes = await archive()
  const record = recordFor(bytes)
  const recordPath = join(root, 'catalog/feature-packs', `${manifest.id}.json`)
  const artifactPath = join(root, 'artifacts', `${manifest.id}-${manifest.version}.dshpack`)
  await writeFile(recordPath, JSON.stringify(record))
  await writeFile(artifactPath, bytes)
  assert.deepEqual(await buildCatalog(root, { checkOnly: true }), { checked: 1 })
  await assert.rejects(readFile(join(root, 'site/public/generated/catalog.json')), { code: 'ENOENT' })
  const result = await buildCatalog(root)
  assert.equal(result.packs.length, 1)
  assert.equal(result.packs[0].metadata.category, 'function')
  await writeFile(recordPath, JSON.stringify({ ...record, category: 'appearance', appearance: {
    kind: 'skin', loader: { id: '@example/loader', version: '1.0.0', source: 'https://example.org/loader' }, skinIds: ['test-skin']
  } }))
  const appearanceCatalog = await buildCatalog(root)
  assert.equal(appearanceCatalog.packs[0].metadata.category, 'appearance')
  assert.equal(appearanceCatalog.packs[0].appearance.loader.id, '@example/loader')
  await writeFile(recordPath, JSON.stringify(record))
  await buildCatalog(root)
  const downloaded = await readFile(join(root, 'site/public', result.packs[0].archiveUrl))
  assert.deepEqual(downloaded, bytes)
  assert.equal(result.packs[0].archiveDigest, `sha256:${digest(downloaded)}`)
  assert.deepEqual(await buildCatalog(root), result)
  const publicDir = join(root, 'site/public')
  assert.deepEqual(await verifyDownloads(publicDir), { verified: 1 })
  const catalogPath = join(publicDir, 'generated/catalog.json')
  const changed = structuredClone(result)
  changed.packs[0].components[0].version = '9.9.9'
  await writeFile(catalogPath, JSON.stringify(changed))
  await assert.rejects(verifyDownloads(publicDir), /Catalog display differs/)
  await buildCatalog(root)
  await rm(join(publicDir, result.packs[0].archiveUrl))
  await assert.rejects(verifyDownloads(publicDir), { code: 'ENOENT' })
  await buildCatalog(root)
  const server = createServer((request, response) => {
    if (request.url !== `/dsh-mojobox/${result.packs[0].archiveUrl}`) { response.writeHead(404).end(); return }
    response.end(downloaded)
  })
  await new Promise(accept => server.listen(0, '127.0.0.1', accept))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/dsh-mojobox/${result.packs[0].archiveUrl}`)
    assert.equal(response.status, 200)
    assert.equal(digest(Buffer.from(await response.arrayBuffer())), record.sha256)
  } finally { await new Promise(accept => server.close(accept)) }
  await buildCatalog(root, { demo: true })
  await assert.rejects(verifyDownloads(publicDir), /cannot be published/)
  assert.deepEqual(await verifyDownloads(publicDir, { allowDemo: true }), { verified: 1 })
  await writeFile(join(publicDir, result.packs[0].reportUrl), '{}')
  await assert.rejects(verifyDownloads(publicDir, { allowDemo: true }), /report\/manifest mismatch/)
  await buildCatalog(root)
  const before = await readFile(join(root, 'site/public/generated/catalog.json'))
  await writeFile(artifactPath, await archive({ ...manifest, version: '2.0.0' }))
  await assert.rejects(buildCatalog(root), /SHA-256 mismatch/)
  await writeFile(recordPath, JSON.stringify({ ...record, sha256: digest(await readFile(artifactPath)) }))
  await assert.rejects(buildCatalog(root), /identity mismatch/)
  assert.deepEqual(await readFile(join(root, 'site/public/generated/catalog.json')), before)
  await rm(recordPath)
  assert.equal((await buildCatalog(root)).packs.length, 0)
  await assert.rejects(readFile(join(root, 'site/public', result.packs[0].archiveUrl)), { code: 'ENOENT' })
})
