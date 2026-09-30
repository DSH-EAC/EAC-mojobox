import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import yauzl from 'yauzl'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const jsonLimit = 1024 * 1024
const ajv = new Ajv2020({ allErrors: true, strict: true })
addFormats(ajv)
const schemas = {}
const checks = {}
for (const [kind, path] of Object.entries({
  pack: 'schemas/pack.schema.json',
  lock: 'schemas/pack-lock.schema.json',
  plugin: 'vendor/dsh-std/dsh-plugin-0.15.schema.json',
  packageMetadata: 'schemas/official-package-metadata.schema.json'
})) {
  schemas[kind] = JSON.parse(await readFile(join(root, path), 'utf8'))
  checks[kind] = ajv.compile(schemas[kind])
}

function validate(kind, value) {
  if (!checks[kind](value)) throw new Error(`Invalid ${kind}: ${ajv.errorsText(checks[kind].errors)}`)
}

async function entriesOf(zip) {
  const entries = new Map()
  await new Promise((resolveEntries, reject) => {
    zip.once('error', reject)
    zip.once('end', resolveEntries)
    zip.on('entry', entry => {
      const name = entry.fileName
      // A Pack has at most 64 components, each referencing one Manifest and one artifact.
      if (entries.size >= 2 + schemas.pack.properties.components.maxItems * 2) return reject(new Error('Too many archive entries'))
      if (!/^(pack\.json|pack\.lock\.json|objects\/sha256\/[a-f0-9]{64})$/.test(name)) return reject(new Error(`Unexpected archive path: ${name}`))
      if (entries.has(name)) return reject(new Error(`Duplicate archive entry: ${name}`))
      const fileType = (entry.externalFileAttributes >>> 16) & 0o170000
      if (fileType && fileType !== 0o100000) return reject(new Error(`Archive entry is not a regular file: ${name}`))
      entries.set(name, entry)
      zip.readEntry()
    })
    zip.readEntry()
  })
  return entries
}

async function readEntry(zip, entry, asJson = false) {
  if (!entry) throw new Error('Missing archive entry')
  if (asJson && entry.uncompressedSize > jsonLimit) throw new Error(`JSON exceeds 1 MiB: ${entry.fileName}`)
  const stream = await promisify(zip.openReadStream.bind(zip))(entry)
  const hash = createHash('sha256')
  const chunks = []
  let size = 0
  for await (const chunk of stream) {
    size += chunk.length
    if (asJson && size > jsonLimit) throw new Error(`JSON exceeds 1 MiB: ${entry.fileName}`)
    hash.update(chunk)
    if (asJson) chunks.push(chunk)
  }
  const digest = `sha256:${hash.digest('hex')}`
  if (!asJson) return { digest, size }
  try {
    return { digest, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  } catch {
    throw new Error(`Invalid JSON: ${entry.fileName}`)
  }
}

export async function inspectPack(file) {
  const zip = await promisify(yauzl.open)(file, { lazyEntries: true, autoClose: false, strictFileNames: true })
  try {
    const entries = await entriesOf(zip)
    if (!entries.has('pack.json')) throw new Error('Missing pack.json; expected a Mojobox Pack archive')
    const { value: pack } = await readEntry(zip, entries.get('pack.json'), true)
    if (pack && Object.hasOwn(pack, 'formatVersion')) {
      throw new Error('EAC Feature Pack formatVersion is not Mojobox Pack; these .dshpack formats are not interchangeable')
    }
    validate('pack', pack)
    if (!entries.has('pack.lock.json')) throw new Error('Missing pack.lock.json')
    const { value: lock } = await readEntry(zip, entries.get('pack.lock.json'), true)
    validate('lock', lock)
    if (lock.pack !== `${pack.metadata.id}@${pack.metadata.version}`) throw new Error('Lock Pack identity mismatch')
    const declared = new Map(pack.components.map(component => [component.id, component]))
    if (declared.size !== pack.components.length || new Set(lock.components.map(component => component.id)).size !== lock.components.length) {
      throw new Error('Duplicate Pack or Lock components')
    }
    if (lock.components.length !== declared.size) throw new Error('Pack and Lock component sets differ')
    const referenced = new Set(['pack.json', 'pack.lock.json'])
    for (const component of lock.components) {
      if (declared.get(component.id)?.version !== component.version) throw new Error(`Pack and Lock component mismatch: ${component.id}`)
      for (const digest of [component.manifestDigest, component.artifactDigest]) {
        const path = `objects/sha256/${digest.slice(7)}`
        if (!entries.has(path)) throw new Error(`Missing object: ${path}`)
        referenced.add(path)
      }
    }
    for (const path of entries.keys()) {
      if (!referenced.has(path)) throw new Error(`Unreferenced object: ${path}`)
    }
    const components = []
    const verifiedArtifacts = new Set()
    for (const component of lock.components) {
      const manifestPath = `objects/sha256/${component.manifestDigest.slice(7)}`
      const { digest, value: manifest } = await readEntry(zip, entries.get(manifestPath), true)
      if (digest !== component.manifestDigest) throw new Error(`Manifest digest mismatch: ${component.id}`)
      validate('plugin', manifest)
      if (Object.hasOwn(manifest, 'x-mojobox-package')) validate('packageMetadata', manifest['x-mojobox-package'])
      if (manifest.id !== component.id || manifest.version !== component.version ||
          component.manifest !== `catalog/plugins/${manifest.id}.json` ||
          component.source !== `npm:${manifest.name}@${manifest.version}`) {
        throw new Error(`Manifest identity or source mismatch: ${component.id}`)
      }
      if (manifest.artifact?.digest !== component.artifactDigest) throw new Error(`Manifest artifact digest mismatch: ${component.id}`)
      if (!verifiedArtifacts.has(component.artifactDigest)) {
        const artifactPath = `objects/sha256/${component.artifactDigest.slice(7)}`
        const artifact = await readEntry(zip, entries.get(artifactPath))
        if (artifact.digest !== component.artifactDigest) throw new Error(`Artifact digest mismatch: ${component.id}`)
        verifiedArtifacts.add(component.artifactDigest)
      }
      components.push({ id: component.id, name: manifest.name, version: component.version,
        required: declared.get(component.id).required, source: component.source,
        manifestDigest: component.manifestDigest, artifactDigest: component.artifactDigest })
    }
    return { format: 'mojobox', apiVersion: pack.apiVersion, metadata: pack.metadata,
      requires: pack.requires || {}, components, verified: 'structure-and-digests',
      notice: 'Structure and digest checks do not establish publisher trust, host compatibility, or offline installability. No plugins were executed.' }
  } finally {
    zip.close()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/inspect-pack.mjs <archive.dshpack>')
    console.log(JSON.stringify(await inspectPack(process.argv[2]), null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
