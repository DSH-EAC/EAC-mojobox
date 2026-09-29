import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Artifact digests come from reviewed catalog records; the build verifies downloaded bytes.
export async function generatePackLock(packFile, { root = repositoryRoot, write = true } = {}) {
  const packsDirectory = await realpath(join(root, 'catalog/packs'))
  if (packsDirectory !== join(await realpath(root), 'catalog/packs')) {
    throw new Error('catalog/packs must not redirect to another directory')
  }
  const packPath = resolve(root, packFile)
  if (dirname(packPath) !== resolve(root, 'catalog/packs') || !packPath.endsWith('.pack.json')) {
    throw new Error('Pack must be a .pack.json file directly inside catalog/packs')
  }
  if (await realpath(packPath) !== join(packsDirectory, basename(packPath))) {
    throw new Error('Pack must not redirect outside catalog/packs')
  }
  const lockPath = join(packsDirectory, basename(packPath).replace(/\.pack\.json$/, '.lock.json'))
  try {
    if (!(await lstat(lockPath)).isFile()) throw new Error('Lock destination must be a regular file')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const ajv = new Ajv2020({ allErrors: true, strict: true })
  const validate = async (schemaFile, value) => {
    const schema = JSON.parse(await readFile(join(root, 'schemas', schemaFile), 'utf8'))
    const check = ajv.compile(schema)
    if (!check(value)) throw new Error(ajv.errorsText(check.errors))
  }
  const pack = JSON.parse(await readFile(packPath, 'utf8'))
  await validate('pack.schema.json', pack)
  if (new Set(pack.components.map(component => component.id)).size !== pack.components.length) {
    throw new Error('Pack contains duplicate components')
  }

  const plugins = new Map()
  const pluginsDirectory = join(root, 'catalog/plugins')
  for (const file of (await readdir(pluginsDirectory)).filter(file => file.endsWith('.json')).sort()) {
    const bytes = await readFile(join(pluginsDirectory, file))
    const manifest = JSON.parse(bytes.toString('utf8'))
    if (plugins.has(manifest.id)) throw new Error(`Duplicate plugin id: ${manifest.id}`)
    plugins.set(manifest.id, { manifest, bytes, file })
  }

  const lock = {
    $schema: 'https://mojobox.dev/schemas/pack-lock-v1alpha1.json',
    apiVersion: 'packs.mojobox.dev/v1alpha1',
    kind: 'PackLock',
    pack: `${pack.metadata.id}@${pack.metadata.version}`,
    components: pack.components.map(component => {
      const plugin = plugins.get(component.id)
      if (!plugin) throw new Error(`Unknown plugin: ${component.id}`)
      const { manifest, bytes, file } = plugin
      if (manifest.version !== component.version) throw new Error(`${component.id} version differs from catalog`)
      if (!manifest.artifact?.path || !manifest.artifact.digest) {
        throw new Error(`${component.id} has no published artifact`)
      }
      return {
        id: component.id,
        version: component.version,
        source: `npm:${manifest.name}@${component.version}`,
        manifest: `catalog/plugins/${file}`,
        manifestDigest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
        artifactDigest: manifest.artifact.digest
      }
    })
  }
  await validate('pack-lock.schema.json', lock)
  if (write) await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
  return { lock, lockPath }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/lock-pack.mjs catalog/packs/<id>.pack.json')
    const { lockPath } = await generatePackLock(process.argv[2])
    console.log(`Generated ${lockPath}`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
