import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'

const candidate = new URL('../candidates/community-skins/', import.meta.url)
const plugins = new URL('../catalog/plugins/', import.meta.url)
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

async function inputs() {
  const bytes = await readFile(new URL('community-metadata.json', candidate))
  const source = JSON.parse(bytes)
  const records = await Promise.all((await readdir(plugins)).filter(path => path.endsWith('.json'))
    .map(async path => JSON.parse(await readFile(new URL(path, plugins), 'utf8'))))
  return { bytes, source, records: records.filter(record => record['x-mojobox-source-metadata']?.sourceMetadataDigest === sha256(bytes)) }
}

test('community skin contribution preserves the original source bytes and every requested project', async () => {
  const { bytes, source, records } = await inputs()
  assert.equal(sha256(bytes), 'sha256:d5c5852efbe97ebb5b2b2102c1b3ec2c02ad540f7f086443e44ff6e8e93a0e03')
  const beauty = JSON.parse(await readFile(new URL('beauty-skins.json', candidate), 'utf8'))
  const { sourceMetadataDigest, mojobox, ...originalBeauty } = beauty
  assert.equal(sourceMetadataDigest, sha256(bytes))
  assert.equal(mojobox.status, 'source-only')
  assert.deepEqual(originalBeauty, source.skins.find(skin => skin.id === 'beauty-skins'))
  assert.deepEqual(new Set([...records.map(record => record['x-mojobox-source-metadata'].skinId), beauty.id]), new Set(source.skins.map(skin => skin.id)))
  assert.equal(records.some(record => record['x-mojobox-source-metadata'].skinId === beauty.id), false)
})

test('community skin catalog entries and official projections match the retained package snapshots', async () => {
  const { source, records } = await inputs()
  const snapshots = await Promise.all((await readdir(new URL('package-snapshots/', candidate)))
    .map(async path => {
      const bytes = await readFile(new URL(`package-snapshots/${path}`, candidate))
      return { digest: sha256(bytes), pkg: JSON.parse(bytes) }
    }))
  assert.equal(records.length, snapshots.length)
  for (const record of records) {
    const metadata = record['x-mojobox-source-metadata']
    const snapshot = snapshots.find(snapshot => snapshot.digest === metadata.packageSnapshotDigest)
    assert.ok(snapshot, `Missing package provenance for ${record.id}`)
    assert.equal(record.name, snapshot.pkg.name)
    assert.equal(record.version, snapshot.pkg.version)
    assert.equal(record.facets.host.entry, snapshot.pkg.main.replace(/^\.\//, ''))
    const skin = source.skins.find(skin => skin.id === metadata.skinId)
    assert.equal(record.source.repository, skin.sources[0].repositoryUrl)
    assert.equal(record.source.revision, skin.sources[0].revision)
    assert.equal(record['x-mojobox-maintenance'].source, 'registry-maintained')
    assert.equal(metadata.runtimeVerification, 'not-tested')
    assert.equal(metadata.loaderIntegration, 'not-verified')
    if (record.artifact) {
      assert.equal(record['x-mojobox-publication'].artifactVerification, 'local-sha256')
      const projection = Object.fromEntries(['dependencies', 'peerDependencies', 'engines', 'dsh']
        .filter(key => key in snapshot.pkg).map(key => [key, snapshot.pkg[key]]))
      assert.deepEqual(record['x-mojobox-package'], projection)
    } else {
      assert.equal(record['x-mojobox-publication'].status, 'unpublished')
      assert.equal(record['x-mojobox-package'], undefined)
    }
  }
})
