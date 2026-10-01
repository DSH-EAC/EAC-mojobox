import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectFeaturePack, validateRecord } from './feature-pack.mjs'
import { buildSkinPromptCatalog, collectSkinPromptPackages } from './skin-prompt-package.mjs'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export async function buildCatalog(root = rootDir, { checkOnly = false, demo = false } = {}) {
  const skinSource = await collectSkinPromptPackages(root)
  const recordsDir = join(root, 'catalog/feature-packs')
  const entries = (await readdir(recordsDir)).filter(name => name.endsWith('.json')).sort()
  const admitted = []
  const ids = new Set()
  for (const entry of entries) {
    const record = JSON.parse(await readFile(join(recordsDir, entry), 'utf8'))
    validateRecord(record)
    if (entry !== `${record.id}.json`) throw new Error(`Record filename must equal id: ${entry}`)
    if (ids.has(record.id)) throw new Error(`Duplicate pack id: ${record.id}`)
    ids.add(record.id)
    const filename = `${record.id}-${record.version}.dshpack`
    const bytes = await readFile(join(root, 'artifacts', filename))
    const report = await inspectFeaturePack(bytes, record.sha256)
    const m = report.manifest
    if (m.id !== record.id || m.version !== record.version) throw new Error(`Archive identity mismatch: ${record.id}`)
    if ((m.author && m.author !== record.author) || (m.license && m.license !== record.license)) throw new Error(`Author/license mismatch: ${record.id}`)
    admitted.push({ record, report, bytes, filename })
  }
  if (checkOnly) return { checked: admitted.length }
  // Validate the entire intake before replacing any generated output.
  const output = join(root, 'site/public/generated')
  await rm(output, { recursive: true, force: true })
  await mkdir(join(output, 'downloads'), { recursive: true })
  await mkdir(join(output, 'reports'), { recursive: true })
  await mkdir(join(output, 'packs'), { recursive: true })
  const skinCatalog = await buildSkinPromptCatalog(root, output)
  const packs = []
  for (const { record, report, bytes, filename } of admitted) {
    const m = report.manifest
    const packUrl = `generated/packs/${record.id}.json`
    const reportUrl = `generated/reports/${record.id}.json`
    await writeFile(join(output, 'downloads', filename), bytes)
    await writeFile(join(output, 'packs', `${record.id}.json`), JSON.stringify(m, null, 2) + '\n')
    await writeFile(join(output, 'reports', `${record.id}.json`), JSON.stringify(report, null, 2) + '\n')
    packs.push({ format: record.format, metadata: { id: m.id, version: m.version, name: m.name, description: m.description || '', category: record.category },
      author: record.author, license: record.license, source: record.source, requires: m.requires || {},
      components: m.plugins, appearance: record.appearance, archiveUrl: `generated/downloads/${filename}`, archiveSize: report.size,
      archiveDigest: `sha256:${report.sha256}`, packUrl, reportUrl, checks: report.checks, runtime: report.runtime })
  }
  const catalog = { apiVersion: 'catalog.mojobox.dev/v1alpha1', mode: 'intake', demo, plugins: [], packs, skinPackages: skinCatalog.packages, skinSource: skinSource.source || null }
  await writeFile(join(output, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n')
  console.log(`Validated and collected ${packs.length} developer archives.`)
  return catalog
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--check')) throw new Error('Usage: node scripts/build-catalog.mjs [--check]')
  console.log(await buildCatalog(rootDir, { checkOnly: process.argv[2] === '--check' }))
}
