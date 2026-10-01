import assert from 'node:assert/strict'
import { cp, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
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
  }
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
  assert.match(await readFile(join(outputDir, first.promptUrl.replace('generated/', '')), 'utf8'), /设计目标/)
  await assert.doesNotReject(inspectSkinPromptPackage(join(root, 'catalog/skin-prompt-packages', first.metadata.id), first.files))
})
