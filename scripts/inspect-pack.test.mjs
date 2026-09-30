import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ZipArchive } from 'archiver'
import { inspectPack } from './inspect-pack.mjs'

const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const objectPath = digest => `objects/sha256/${digest.slice(7)}`
const json = value => Buffer.from(JSON.stringify(value))

async function fixture(t, edit = () => {}) {
  const dir = await mkdtemp(join(tmpdir(), 'mojobox-inspect-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const pack = JSON.parse(await readFile(new URL('../fixtures/valid/pack.json', import.meta.url)))
  const lock = JSON.parse(await readFile(new URL('../fixtures/valid/pack-lock.json', import.meta.url)))
  const manifest = JSON.parse(await readFile(new URL('../fixtures/valid/plugin-official-package-metadata.json', import.meta.url)))
  manifest.id = pack.components[0].id
  manifest.name = '@example/dsh-file-preview'
  const artifact = Buffer.alloc(2 * 1024 * 1024, 42)
  manifest.artifact = { digest: hash(artifact), algorithm: 'sha256', path: 'https://example.org/artifact.tgz' }
  const input = { pack, lock, manifest, artifact }
  edit(input)
  const manifestBytes = json(input.manifest)
  lock.components[0].manifestDigest = hash(manifestBytes)
  lock.components[0].artifactDigest = hash(input.artifact)
  const entries = [
    { name: 'pack.json', bytes: json(input.pack) },
    { name: 'pack.lock.json', bytes: json(input.lock) },
    { name: objectPath(hash(manifestBytes)), bytes: manifestBytes },
    { name: objectPath(hash(input.artifact)), bytes: input.artifact }
  ]
  return { dir, entries, input }
}

async function archive(dir, entries) {
  const path = join(dir, 'test.dshpack')
  await new Promise((resolve, reject) => {
    const output = createWriteStream(path)
    const zip = new ZipArchive({ zlib: { level: 1 } })
    output.on('close', resolve)
    output.on('error', reject)
    zip.on('error', reject)
    zip.pipe(output)
    for (const entry of entries) zip.append(entry.bytes, { name: entry.name })
    zip.finalize()
  })
  return path
}

test('inspects a valid archive without extracting its large artifact', async t => {
  const { dir, entries } = await fixture(t)
  const result = await inspectPack(await archive(dir, entries))
  assert.equal(result.format, 'mojobox')
  assert.equal(result.components[0].name, '@example/dsh-file-preview')
  assert.equal(result.verified, 'structure-and-digests')
  assert.match(result.notice, /do not establish/)
})

const badCases = {
  'EAC format': { edit: input => { input.pack = { formatVersion: 1 } }, error: /EAC Feature Pack/ },
  'Pack schema': { edit: input => { input.pack.kind = 'Other' }, error: /Invalid pack/ },
  'Lock schema': { edit: input => { input.lock.components[0].source = 'npm:example@latest' }, error: /Invalid lock/ },
  'Pack identity': { edit: input => { input.lock.pack = 'org.example.other@1.0.0' }, error: /identity mismatch/ },
  'duplicate Pack components': { edit: input => { input.pack.components.push(input.pack.components[0]) }, error: /Duplicate/ },
  'duplicate Lock components': { edit: input => { input.lock.components.push(input.lock.components[0]) }, error: /Duplicate/ },
  'component identity': { edit: input => { input.lock.components[0].id = 'org.example.other' }, error: /component mismatch/ },
  'Manifest schema': { edit: input => { input.manifest.manifestVersion = 'unsupported' }, error: /Invalid plugin/ },
  'official metadata': { edit: input => { input.manifest['x-mojobox-package'].dsh.manifestVersion = 9 }, error: /Invalid packageMetadata/ },
  'Manifest name': { edit: input => { input.manifest.name = '@example/other' }, error: /identity or source/ },
  'Manifest version': { edit: input => { input.manifest.version = '2.0.0' }, error: /identity or source/ },
  'Manifest identity': { edit: input => { input.manifest.id = 'org.example.other' }, error: /identity or source/ },
  'Manifest path': { edit: input => { input.lock.components[0].manifest = 'catalog/plugins/org.example.other.json' }, error: /identity or source/ },
  'artifact metadata': { edit: input => { input.manifest.artifact.digest = `sha256:${'0'.repeat(64)}` }, error: /Manifest artifact digest/ }
}
for (const [name, { edit, error }] of Object.entries(badCases)) {
  test(`rejects ${name}`, async t => {
    const { dir, entries } = await fixture(t, edit)
    await assert.rejects(inspectPack(await archive(dir, entries)), error)
  })
}

for (const [name, mutate, error] of [
  ['missing Lock', entries => entries.splice(1, 1), /Missing pack.lock.json/],
  ['missing Pack', entries => entries.shift(), /Missing pack.json/],
  ['missing object', entries => entries.pop(), /Missing object/],
  ['duplicate entry', entries => entries.push(entries[0]), /Duplicate archive entry/],
  ['unexpected path', entries => entries.push({ name: 'extra.txt', bytes: 'extra' }), /Unexpected archive path/],
  ['unreferenced object', entries => entries.push({ name: objectPath(hash('extra')), bytes: 'extra' }), /Unreferenced object/],
  ['Manifest corruption', entries => { entries[2].bytes = Buffer.concat([entries[2].bytes, Buffer.from(' ')]) }, /Manifest digest mismatch/],
  ['artifact corruption', entries => { entries[3].bytes = Buffer.from('changed') }, /Artifact digest mismatch/],
  ['invalid JSON', entries => { entries[0].bytes = Buffer.from('{') }, /Invalid JSON/],
  ['oversized JSON', entries => { entries[0].bytes = Buffer.alloc(1024 * 1024 + 1, 32) }, /JSON exceeds/]
]) {
  test(`rejects ${name}`, async t => {
    const { dir, entries } = await fixture(t)
    mutate(entries)
    await assert.rejects(inspectPack(await archive(dir, entries)), error)
  })
}

test('rejects traversal names in ZIP metadata', async t => {
  const { dir, entries } = await fixture(t)
  entries.push({ name: 'extra.txt', bytes: 'extra' })
  const path = await archive(dir, entries)
  const bytes = await readFile(path)
  // Archiver sanitizes traversal names, so corrupt both same-length ZIP names after writing.
  for (let offset = bytes.indexOf('extra.txt'); offset !== -1; offset = bytes.indexOf('extra.txt', offset + 9)) {
    bytes.write('../escape', offset)
  }
  await writeFile(path, bytes)
  await assert.rejects(inspectPack(path), /invalid relative path|Unexpected archive path/)
})

test('rejects a truncated ZIP without leaking an open archive', async t => {
  const { dir, entries } = await fixture(t)
  const path = await archive(dir, entries)
  const bytes = await readFile(path)
  await writeFile(path, bytes.subarray(0, bytes.length - 30))
  await assert.rejects(inspectPack(path), /end of central directory|invalid|unexpected/i)
})
