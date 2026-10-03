import assert from 'node:assert/strict'
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildSkinPromptCatalog, collectSkinPromptPackages, inspectSkinPromptPackage } from './skin-prompt-package.mjs'

test('source snapshot contains the ten prompt packages and preserves their fixed provenance', async () => {
  const result = await collectSkinPromptPackages()
  assert.equal(result.source.revision, 'bcb2ecaf318f60df2ff86e5214d646a785ccabc9')
  assert.equal(result.packages.length, 10)
  assert.deepEqual(result.packages.map(item => item.manifest.id), [
    'blue-fantasy', 'dragon-heir', 'maid-atelier', 'miku', 'minecraft',
    'qq98', 'ths', 'trading', 'whale-song', 'xp'
  ])
  for (const item of result.packages) {
    assert.equal(item.manifest.kind, 'skin-prompt-package')
    assert.equal(item.manifest.prompt, 'prompt.md')
    assert.match(item.files.manifest, /^sha256:[a-f0-9]{64}$/)
    assert.ok(item.manifest.requiredPromptSections.length >= 1)
    assert.ok(item.origin.repository.startsWith('https://github.com/'))
    assert.ok(!item.origin.repository.includes('DSH-Desktop-EAC'))
  }
  assert.equal(result.packages.find(item => item.manifest.id === 'maid-atelier').origin.repository, 'https://github.com/Small-tailqwq/dsh-deep-whale')
})

test('skin prompt build copies only declared package files into the generated catalog', async t => {
  const root = await mkdtemp(join(tmpdir(), 'mojobox-skin-prompt-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'catalog'), { recursive: true })
  await mkdir(join(root, 'schemas'), { recursive: true })
  await cp(join(process.cwd(), 'catalog/skin-prompt-packages'), join(root, 'catalog/skin-prompt-packages'), { recursive: true })
  await cp(join(process.cwd(), 'schemas/skin-prompt-package.schema.json'), join(root, 'schemas/skin-prompt-package.schema.json'))
  const outputDir = join(root, 'generated')
  const catalog = await buildSkinPromptCatalog(root, outputDir)
  const output = JSON.parse(await readFile(join(outputDir, 'skin-catalog.json'), 'utf8'))
  assert.equal(catalog.packages.length, 10)
  assert.deepEqual(output.packages.map(item => item.metadata.id), catalog.packages.map(item => item.metadata.id))
  assert.equal(output.packages.every(item => item.installable === false && item.runtime === 'not-applicable'), true)
  const first = output.packages[0]
  assert.equal(first.origin.repository, 'https://github.com/zhu1090093659/dsh-skins')
  assert.match(first.origin.previews[0].url, /540acca50403cadeaf1a902d29bb1540011b5e73/)
  assert.match(await readFile(join(outputDir, first.promptUrl.replace('generated/', '')), 'utf8'), /设计目标/)
  await assert.doesNotReject(inspectSkinPromptPackage(join(root, 'catalog/skin-prompt-packages', first.metadata.id), first.files))
  const originsPath = join(root, 'catalog/skin-prompt-packages/origins.json')
  const origins = JSON.parse(await readFile(originsPath, 'utf8'))
  origins['blue-fantasy'].previews[0].url = 'javascript:alert(1)'
  await writeFile(originsPath, JSON.stringify(origins))
  await assert.rejects(buildSkinPromptCatalog(root, outputDir), /must be an HTTPS URL/)
})
