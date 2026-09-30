import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectFeaturePack } from './feature-pack.mjs'

export async function verifyDownloads(directory, { allowDemo = false } = {}) {
  const catalog = JSON.parse(await readFile(join(directory, 'generated/catalog.json'), 'utf8'))
  if (catalog.mode !== 'intake' || !Array.isArray(catalog.packs)) throw new Error('Expected intake catalog')
  if (catalog.demo && !allowDemo) throw new Error('Test demo cannot be published')
  const files = []
  for (const pack of catalog.packs) {
    const { id, version } = pack.metadata
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(id) || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Invalid download identity')
    const filename = `${id}-${version}.dshpack`
    if (pack.archiveUrl !== `generated/downloads/${filename}` || pack.packUrl !== `generated/packs/${id}.json` || pack.reportUrl !== `generated/reports/${id}.json`) throw new Error('Download path mismatch')
    if (!/^sha256:[a-f0-9]{64}$/.test(pack.archiveDigest)) throw new Error('Missing download digest')
    const bytes = await readFile(join(directory, pack.archiveUrl))
    const report = await inspectFeaturePack(bytes, pack.archiveDigest.slice(7))
    if (report.manifest.id !== id || report.manifest.version !== version || report.size !== pack.archiveSize) throw new Error('Download metadata mismatch')
    const storedReport = JSON.parse(await readFile(join(directory, pack.reportUrl), 'utf8'))
    const storedManifest = JSON.parse(await readFile(join(directory, pack.packUrl), 'utf8'))
    if (JSON.stringify(report) !== JSON.stringify(storedReport) || JSON.stringify(report.manifest) !== JSON.stringify(storedManifest)) throw new Error('Download report/manifest mismatch')
    files.push(filename)
  }
  if (JSON.stringify((await readdir(join(directory, 'generated/downloads'))).sort()) !== JSON.stringify(files.sort())) throw new Error('Unexpected or duplicate download entries')
  return { verified: files.length }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.length > 2 || (args[1] && args[1] !== '--allow-demo')) throw new Error('Usage: npm run verify:downloads -- [dist] [--allow-demo]')
  console.log(await verifyDownloads(resolve(args[0] || 'dist'), { allowDemo: args[1] === '--allow-demo' }))
}
