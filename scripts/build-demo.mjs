import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ZipArchive } from 'archiver'
import { buildCatalog } from './build-catalog.mjs'
import { digest } from './feature-pack.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const demo = join(root, '.cache/intake-demo')
await rm(demo, { recursive: true, force: true })
await mkdir(join(demo, 'catalog/feature-packs'), { recursive: true })
await mkdir(join(demo, 'artifacts'))
const manifestBytes = await readFile(join(root, 'fixtures/intake/valid.json'))
const manifest = JSON.parse(manifestBytes)
const zip = new ZipArchive({ zlib: { level: 9 } })
const chunks = []
const completed = new Promise((accept, reject) => {
  zip.on('data', chunk => chunks.push(chunk))
  zip.on('end', accept)
  zip.on('error', reject)
})
zip.append(manifestBytes, { name: 'pack.json', date: new Date('1980-01-01T00:00:00Z'), mode: 0o644 })
await zip.finalize()
await completed
const bytes = Buffer.concat(chunks)
await writeFile(join(demo, 'artifacts', `${manifest.id}-${manifest.version}.dshpack`), bytes)
await writeFile(join(demo, 'catalog/feature-packs', `${manifest.id}.json`), JSON.stringify({
  format: 'eac-feature-pack-v1', id: manifest.id, version: manifest.version,
  category: 'function', source: 'https://example.org/mojobox-test-only', author: manifest.author, license: manifest.license, sha256: digest(bytes)
}))
await buildCatalog(demo, { demo: true })
await copyFile(join(root, 'site/public/favicon.svg'), join(demo, 'site/public/favicon.svg'))
execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.config.mjs'], {
  cwd: root, env: { ...process.env, MOJOBOX_DEMO: '1' }, stdio: 'inherit'
})
