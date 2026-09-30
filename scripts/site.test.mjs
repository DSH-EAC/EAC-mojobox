import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../site/src/main.js', import.meta.url), 'utf8')
const readJson = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'))
const pack = await readJson('catalog/packs/dev.aio.function.pack.json')
const lock = await readJson('catalog/packs/dev.aio.function.lock.json')
const manifest = await readJson(lock.components[0].manifest)
const plugin = { ...manifest, evidence: [], manifestUrl: `generated/manifests/${manifest.id}.json` }
const archiveDigest = `sha256:${'a'.repeat(64)}`
const samplePack = {
  ...pack, lock, archiveDigest, archiveSize: 12345,
  archiveUrl: 'generated/downloads/sample.dshpack',
  packUrl: 'generated/packs/sample.pack.json',
  lockUrl: 'generated/packs/sample.lock.json'
}
const catalog = {
  plugins: [plugin], packs: [samplePack],
  specifications: { dshStd: { manifestVersion: '0.15', revision: 'a'.repeat(40) } }
}

// Exercise real rendering functions without a browser, network, or generated site.
// Only module imports and automatic startup are replaced; this does not test layout.
function loadSite(base = '/', data = catalog) {
  const app = { innerHTML: '', className: '' }
  const context = vm.createContext({
    URL, basePath: base, inputCatalog: structuredClone(data),
    createIcons() {},
    document: {
      querySelector: selector => selector === '#app' ? app : null,
      querySelectorAll: () => []
    }
  })
  const script = source
    .replace(/^import \{[\s\S]*?from 'lucide'\r?\n/, '')
    .replace("import './styles.css'", '')
    .replace(/const iconSet = \{[\s\S]*?\n\}/, 'const iconSet = {}')
    .replace('import.meta.env.BASE_URL', 'basePath')
    .replace(/start\(\)\.catch\([\s\S]*$/, '')
  vm.runInContext(`${script}\ncatalog = inputCatalog`, context)
  return { app, run: script => vm.runInContext(script, context) }
}

test('failed, revoked and expired evidence cannot promote the passing level', () => {
  const site = loadSite()
  site.run(`globalThis.records = [
    { evidenceLevel: 'Parsed', result: 'pass', revoked: false },
    { evidenceLevel: 'Tested', result: 'fail', revoked: false },
    { evidenceLevel: 'Attested', result: 'pass', revoked: true },
    { evidenceLevel: 'Observed', result: 'pass', revoked: false, expiresAt: '2000-01-01T00:00:00Z' }
  ]`)
  assert.equal(site.run('highestEvidence(records)'), 'Parsed')
  assert.equal(site.run('highestEvidence(records.slice(1))'), 'Declared')
  assert.equal(site.run('evidenceStatus(records[1])'), '失败')
  assert.equal(site.run('evidenceStatus(records[2])'), '已撤回')
  assert.equal(site.run('evidenceStatus(records[3])'), '已过期')
  assert.equal(site.run('highestEvidence([{evidenceLevel: "Tested", result: "pass", revoked: false}])'), 'Tested')
})

test('pack search includes description and renders an explicit empty result', () => {
  const site = loadSite()
  site.run('state.tab = "packs"; state.query = catalog.packs[0].metadata.description; render()')
  assert.match(site.app.innerHTML, /data-select="dev.aio.function"/)
  site.run('state.query = "does-not-exist-92371"; render()')
  assert.match(site.app.innerHTML, /没有匹配项/)
  assert.doesNotMatch(site.app.innerHTML, /data-select=/)
  site.run('state.query = ""; render()')
  assert.match(site.app.innerHTML, /data-select="dev.aio.function"/)
  assert.doesNotMatch(site.app.innerHTML, /<option value="appearance"/)
})

for (const base of ['/', '/dsh-mojobox/']) {
  test(`downloads retain deployment base ${base}, hashes and exact components`, () => {
    const site = loadSite(base)
    const html = site.run('packDetail(catalog.packs[0])')
    for (const path of [samplePack.archiveUrl, samplePack.packUrl, samplePack.lockUrl]) {
      assert.ok(html.includes(`href="${base}${path}" download`))
    }
    assert.ok(html.includes(`data-copy="${archiveDigest}"`))
    assert.match(html, /12,345 字节/)
    for (const component of lock.components) {
      assert.ok(html.includes(component.source))
      assert.ok(html.includes(`data-open-plugin="${component.id}"`))
    }
    assert.match(html, /host.snapshot/)
    assert.match(html, /win32 \/ x64/)
    assert.doesNotMatch(html, /dsh-eac:\/\//)
    const pluginHtml = site.run('pluginDetail(catalog.plugins[0])')
    assert.ok(pluginHtml.includes(`href="${base}${plugin.manifestUrl}" download`))
  })
}

test('catalog text is escaped rather than rendered as active markup', () => {
  const data = structuredClone(catalog)
  data.packs[0].metadata.description = '<img src=x onerror="alert(1)">'
  const site = loadSite('/', data)
  const html = site.run('packDetail(catalog.packs[0])')
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'))
  assert.doesNotMatch(html, /<img src=x/)
})

const intakePack = { ...samplePack, format: 'eac-feature-pack-v1', author: 'Test developer', license: 'MIT',
  source: 'https://example.org/release', reportUrl: 'generated/reports/sample.json',
  requires: { dsh: '>=0.1.7' }, components: [{ ref: '@example/test-only', version: '1.0.0' }] }

for (const base of ['/', '/dsh-mojobox/']) {
  test(`intake catalog renders downloads and truthful check scope at ${base}`, () => {
    const site = loadSite(base, { mode: 'intake', demo: true, plugins: [], packs: [intakePack] })
    site.run('state.selected = catalog.packs[0].metadata.id; render()')
    const html = site.app.innerHTML
    for (const path of [intakePack.archiveUrl, intakePack.packUrl, intakePack.reportUrl]) assert.ok(html.includes(`href="${base}${path}" download`))
    assert.match(html, /测试演示/)
    assert.match(html, /宿主运行尚未测试/)
    assert.match(html, /Test developer/)
    assert.match(html, /@example\/test-only/)
    assert.doesNotMatch(html, />Lock<|data-open-plugin|有效通过等级/)
    site.run('state.query = "does-not-exist"; render()')
    assert.match(site.app.innerHTML, /没有匹配项/)
  })
}

test('empty production intake and missing selection render without legacy specifications', () => {
  const site = loadSite('/', { mode: 'intake', demo: false, plugins: [], packs: [] })
  site.run('state.selected = "missing"; render()')
  assert.match(site.app.innerHTML, /暂无正式收录/)
  assert.match(site.app.innerHTML, /未找到此整合包/)
  assert.doesNotMatch(site.app.innerHTML, /测试演示|href="\/generated\/downloads/)
})

test('intake escapes developer/component fields and blocks unsafe source links', () => {
  const pack = { ...intakePack, author: '<img src=x>', source: 'javascript:alert(1)', components: [{ ref: '<script>bad</script>' }] }
  const site = loadSite('/', { mode: 'intake', plugins: [], packs: [pack] })
  site.run('state.selected = catalog.packs[0].metadata.id; render()')
  assert.match(site.app.innerHTML, /&lt;img src=x&gt;/)
  assert.doesNotMatch(site.app.innerHTML, /javascript:|<script>bad/)
})
