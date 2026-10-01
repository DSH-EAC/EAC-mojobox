import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageFiles = ['manifest.json', 'prompt.md', 'README.md']
const ajv = new Ajv2020({ allErrors: true })
addFormats(ajv)
const checkManifest = ajv.compile(JSON.parse(await readFile(new URL('../schemas/skin-prompt-package.schema.json', import.meta.url))))

export const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

function assertHttps(value, field) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${field} must be an HTTPS URL without credentials`)
}

export async function inspectSkinPromptPackage(directory, expectedFiles) {
  const manifestBytes = await readFile(join(directory, 'manifest.json'))
  const promptBytes = await readFile(join(directory, 'prompt.md'))
  const readmeBytes = await readFile(join(directory, 'README.md'))
  const manifest = JSON.parse(manifestBytes.toString('utf8'))
  if (!checkManifest(manifest)) throw new Error(`Invalid skin prompt package: ${ajv.errorsText(checkManifest.errors)}`)
  if (manifest.id !== basename(directory)) throw new Error(`Skin package directory must equal id: ${manifest.id}`)
  if (manifest.prompt !== 'prompt.md') throw new Error(`Skin package prompt must be prompt.md: ${manifest.id}`)
  const files = { manifest: digest(manifestBytes), prompt: digest(promptBytes), readme: digest(readmeBytes) }
  if (expectedFiles) {
    for (const name of packageFiles) {
      const key = name === 'manifest.json' ? 'manifest' : name.replace('.md', '')
      if (files[key] !== expectedFiles[key]) throw new Error(`Skin package ${manifest.id} ${key} digest mismatch`)
    }
  }
  return { format: 'dsh-skin-prompt-package-v1', manifest, files }
}

export async function collectSkinPromptPackages(root = rootDir) {
  const sourceDir = join(root, 'catalog/skin-prompt-packages')
  let source
  try {
    source = JSON.parse(await readFile(join(sourceDir, 'source.json'), 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return { source: null, packages: [] }
    throw error
  }
  if (source.format !== 'dsh-skin-prompt-source-v1') throw new Error('Invalid skin prompt source format')
  assertHttps(source.repository, 'Skin prompt source repository')
  if (!/^[0-9a-f]{40}$/.test(source.revision)) throw new Error('Invalid skin prompt source revision')
  if (source.schemaPath !== 'skin-prompts/schema/manifest.schema.json') throw new Error('Unexpected skin prompt schema path')
  const schemaBytes = await readFile(join(root, 'schemas/skin-prompt-package.schema.json'))
  if (digest(schemaBytes) !== source.schemaDigest) throw new Error('Skin prompt schema digest mismatch')
  if (!Array.isArray(source.packages) || !source.packages.length) throw new Error('No skin prompt packages declared')
  const declared = new Set()
  const packages = []
  for (const entry of source.packages) {
    if (!entry || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id) || entry.path !== `packages/${entry.id}` || declared.has(entry.id)) throw new Error(`Invalid or duplicate skin package record: ${entry?.id || 'unknown'}`)
    declared.add(entry.id)
    const directory = join(sourceDir, entry.id)
    const inspected = await inspectSkinPromptPackage(directory, entry.files)
    packages.push({ ...inspected, source: { repository: source.repository, revision: source.revision }, path: entry.path })
  }
  const directories = (await readdir(sourceDir, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
  if (JSON.stringify(directories) !== JSON.stringify([...declared].sort())) throw new Error('Undeclared skin prompt package directory')
  return { source, packages }
}

export async function buildSkinPromptCatalog(root = rootDir, output = join(root, 'site/public/generated')) {
  const { source, packages } = await collectSkinPromptPackages(root)
  const skinOutput = join(output, 'skin-packages')
  await mkdir(skinOutput, { recursive: true })
  const entries = []
  for (const item of packages) {
    const manifest = item.manifest
    const target = join(skinOutput, manifest.id)
    await mkdir(target, { recursive: true })
    for (const name of packageFiles) await writeFile(join(target, name), await readFile(join(root, 'catalog/skin-prompt-packages', manifest.id, name)))
    entries.push({
      format: item.format,
      metadata: { id: manifest.id, name: manifest.name, nameEn: manifest.nameEn || '', description: manifest.description || '', tags: manifest.tags || [], category: 'appearance' },
      author: manifest.author,
      source: item.source,
      license: manifest.references.license.spdx,
      target: manifest.target,
      themes: manifest.target.themes,
      requiredPromptSections: manifest.requiredPromptSections,
      files: item.files,
      manifestUrl: `generated/skin-packages/${manifest.id}/manifest.json`,
      promptUrl: `generated/skin-packages/${manifest.id}/prompt.md`,
      readmeUrl: `generated/skin-packages/${manifest.id}/README.md`,
      runtime: 'not-applicable',
      installable: false
    })
  }
  const catalog = { apiVersion: 'catalog.mojobox.dev/v1alpha1', format: 'dsh-skin-prompt-catalog-v1', source, packages: entries }
  await writeFile(join(output, 'skin-catalog.json'), JSON.stringify(catalog, null, 2) + '\n')
  return catalog
}

export async function verifySkinPromptCatalog(directory) {
  let catalog
  try {
    catalog = JSON.parse(await readFile(join(directory, 'generated/skin-catalog.json'), 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return { verified: 0 }
    throw error
  }
  if (catalog.format !== 'dsh-skin-prompt-catalog-v1' || !Array.isArray(catalog.packages)) throw new Error('Expected skin prompt catalog')
  for (const entry of catalog.packages) {
    const id = entry.metadata?.id
    if (!id || entry.manifestUrl !== `generated/skin-packages/${id}/manifest.json` || entry.promptUrl !== `generated/skin-packages/${id}/prompt.md` || entry.readmeUrl !== `generated/skin-packages/${id}/README.md`) throw new Error('Skin prompt download path mismatch')
    if (entry.installable !== false || entry.runtime !== 'not-applicable') throw new Error('Skin prompt runtime claim mismatch')
    await inspectSkinPromptPackage(join(directory, `generated/skin-packages/${id}`), entry.files)
  }
  return { verified: catalog.packages.length }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 2) throw new Error('Usage: node scripts/skin-prompt-package.mjs')
    const catalog = await buildSkinPromptCatalog()
    console.log(`Validated and collected ${catalog.packages.length} skin prompt packages.`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
