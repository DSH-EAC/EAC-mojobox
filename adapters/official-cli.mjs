import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, realpath, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { createGunzip } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import tar from 'tar-stream'
import yauzl from 'yauzl'
import { inspectPack } from '../scripts/inspect-pack.mjs'

const cliVersion = '0.1.7-alpha.1'
const load = async path => JSON.parse(await readFile(path, 'utf8'))
const artifactPath = (home, digest) => join(home, 'mojobox', 'artifacts', `${digest.slice(7)}.tgz`)

async function profilePaths(home, profile) {
  if (!home || !isAbsolute(home)) throw new Error('An explicit absolute DSH home is required')
  if (!profile || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(profile) || profile.toLowerCase() === 'desktop') {
    throw new Error('An explicit non-desktop profile name is required')
  }
  const canonicalHome = await realpath(home)
  const path = join(canonicalHome, 'profiles', profile)
  if (await realpath(path) !== path) throw new Error('Profile directory must not redirect outside the explicit home')
  return { home: canonicalHome, path }
}

export async function planOfficialPack(inspection, { home, profile }) {
  const paths = await profilePaths(home, profile)
  const config = await load(join(paths.path, 'package.json'))
  const dependencies = config.dependencies || {}
  const bundles = config.dsh?.profile?.bundles || []
  const reasons = []
  if (new Set(inspection.components.map(item => item.name)).size !== inspection.components.length) reasons.push('Multiple components target the same npm package name')
  if (inspection.requires?.hostCapabilities?.length) reasons.push(`Unsupported host capabilities: ${inspection.requires.hostCapabilities.join(', ')}`)
  const platforms = inspection.requires?.platforms
  if (platforms?.length && !platforms.some(item => item.os === process.platform && (!item.arch?.length || item.arch.includes(process.arch)))) reasons.push('Unsupported platform or architecture')
  const components = []
  for (const component of inspection.components) {
    if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(component.name) || !/^sha256:[a-f0-9]{64}$/.test(component.artifactDigest)) throw new Error('Invalid inspected component identity or digest')
    const source = dependencies[component.name]
    let installed
    try { installed = await load(join(paths.path, 'node_modules', component.name, 'package.json')) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    let action = 'add'
    let reason = 'Not installed'
    if (source !== undefined || installed) {
      let managedSource = typeof source === 'string' && source.startsWith('file:') &&
        resolve(paths.path, source.slice(5)) === artifactPath(paths.home, component.artifactDigest)
      if (managedSource) {
        const expected = artifactPath(paths.home, component.artifactDigest)
        try { managedSource = await realpath(expected) === expected }
        catch (error) { if (error.code !== 'ENOENT') throw error; managedSource = false }
      }
      const registrySource = typeof source === 'string' && /^(?:[~^]|>=?|<=?)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(source)
      action = 'blocked'
      reason = 'Existing local, linked, or unrecognized dependency is protected'
      if (registrySource || managedSource) {
        if (installed?.name === component.name && installed.version === component.version) {
          action = 'keep'
          reason = 'Same version already installed; enablement is preserved'
        } else reason = 'Installed version differs or dependency is not fully installed'
      }
    }
    components.push({ ...component, action: reasons.length ? 'blocked' : action,
      reason: reasons.length ? reasons.join('; ') : reason, enabled: bundles.includes(component.name) })
  }
  return { home: paths.home, profile, profilePath: paths.path, components, blocked: components.some(item => item.action === 'blocked') }
}

async function validateCli(cli) {
  if (!cli || !isAbsolute(cli)) throw new Error('An explicit absolute official CLI entry is required')
  const entry = await realpath(cli)
  const packageRoot = dirname(dirname(entry))
  const pkg = await load(join(packageRoot, 'package.json'))
  if (pkg.name !== '@deepseek-ai/dsh' || pkg.version !== cliVersion ||
      typeof pkg.bin?.dsh !== 'string' || await realpath(resolve(packageRoot, pkg.bin.dsh)) !== entry) {
    throw new Error(`Only the official @deepseek-ai/dsh ${cliVersion} bin entry is supported`)
  }
  return entry
}

async function extractArtifact(archive, digest, destination) {
  const zip = await promisify(yauzl.open)(archive, { lazyEntries: true, autoClose: false, strictFileNames: true })
  try {
    const entry = await new Promise((accept, reject) => {
      zip.on('error', reject)
      zip.on('end', () => reject(new Error('Missing locked artifact')))
      zip.on('entry', item => item.fileName === `objects/sha256/${digest.slice(7)}` ? accept(item) : zip.readEntry())
      zip.readEntry()
    })
    const source = await promisify(zip.openReadStream.bind(zip))(entry)
    const hash = createHash('sha256')
    const check = new Transform({ transform(chunk, encoding, callback) { hash.update(chunk); callback(null, chunk) } })
    await pipeline(source, check, createWriteStream(destination, { flags: 'wx' }))
    if (`sha256:${hash.digest('hex')}` !== digest) throw new Error('Extracted artifact digest mismatch')
  } finally { zip.close() }
}

async function verifyArtifact(path, component) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  if (`sha256:${hash.digest('hex')}` !== component.artifactDigest) throw new Error('Stored artifact digest mismatch')
  const extract = tar.extract()
  const completed = pipeline(createReadStream(path), createGunzip(), extract)
  completed.catch(() => {})
  let metadata
  try {
    for await (const entry of extract) {
      if (entry.header.name !== 'package/package.json') { entry.resume(); continue }
      if (metadata || entry.header.type !== 'file' || entry.header.size > 1024 * 1024) throw new Error('Invalid or duplicate npm package metadata')
      const chunks = []
      let size = 0
      for await (const chunk of entry) {
        size += chunk.length
        if (size > 1024 * 1024) throw new Error('Package metadata exceeds 1 MiB')
        chunks.push(chunk)
      }
      metadata = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    }
    await completed
  } catch (error) { extract.destroy(error); await completed.catch(() => {}); throw error }
  const patch = metadata?.dsh?.bundle?.patch
  if (metadata?.name !== component.name || metadata.version !== component.version ||
      !(typeof patch === 'string' && patch.length || Array.isArray(patch) && patch.length && patch.every(item => typeof item === 'string' && item.length))) {
    throw new Error('Artifact must contain the locked npm name/version and a DSH bundle patch declaration')
  }
}

export async function installOfficialPack(archive, { home, profile, cli, confirm }) {
  if (confirm !== true) throw new Error('Explicit confirmation is required before installing')
  const inspection = await inspectPack(archive)
  const entry = await validateCli(cli)
  const plan = await planOfficialPack(inspection, { home, profile })
  if (plan.blocked) return { ...plan, results: [], status: 'blocked' }
  const additions = plan.components.filter(item => item.action === 'add')
  if (additions.length) {
    const [major, minor] = process.versions.node.split('.').map(Number)
    if (!(major === 22 && minor >= 19 || major >= 24)) throw new Error('Official CLI requires Node.js 22.19+ or 24+ for import.meta.main')
    for (const directory of [join(plan.home, 'mojobox'), join(plan.home, 'mojobox', 'artifacts')]) {
      await mkdir(directory, { recursive: true })
      if (await realpath(directory) !== directory) throw new Error('Artifact directory must stay inside the explicit home')
    }
    for (const component of additions) {
      const path = artifactPath(plan.home, component.artifactDigest)
      try {
        await realpath(path)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
        try { await extractArtifact(archive, component.artifactDigest, path) }
        catch (error) { if (error.code !== 'EEXIST') await rm(path, { force: true }); throw error }
      }
      if (await realpath(path) !== path) throw new Error('Stored artifact must not redirect')
      await verifyArtifact(path, component)
    }
  }
  const results = []
  for (const component of plan.components) {
    if (component.action === 'keep') { results.push({ id: component.id, status: 'kept' }); continue }
    let current
    try { current = (await planOfficialPack(inspection, { home: plan.home, profile })).components.find(item => item.id === component.id) }
    catch (error) {
      results.push({ id: component.id, status: 'failed', error: error.message })
      return { ...plan, results, status: 'partial-failure' }
    }
    if (current.action === 'keep') { results.push({ id: component.id, status: 'kept' }); continue }
    if (current.action === 'blocked') {
      results.push({ id: component.id, status: 'failed', error: current.reason })
      return { ...plan, results, status: 'partial-failure' }
    }
    const code = await new Promise((accept, reject) => {
      const child = spawn(process.execPath, [entry, 'plugin', '--profile', profile, 'add', `file:${artifactPath(plan.home, component.artifactDigest)}`],
        { env: { ...process.env, DSH_HOME: plan.home }, shell: false, stdio: 'inherit' })
      child.on('error', reject)
      child.on('close', accept)
    }).catch(error => { results.push({ id: component.id, status: 'failed', error: error.message }); return -1 })
    if (code !== 0) {
      if (results.at(-1)?.id !== component.id) results.push({ id: component.id, status: 'failed', exitCode: code })
      return { ...plan, results, status: 'partial-failure' }
    }
    let installed
    try { installed = (await planOfficialPack(inspection, { home: plan.home, profile })).components.find(item => item.id === component.id) }
    catch (error) {
      results.push({ id: component.id, status: 'failed', error: error.message })
      return { ...plan, results, status: 'partial-failure' }
    }
    if (installed.action !== 'keep' || !installed.enabled) {
      results.push({ id: component.id, status: 'failed', error: 'CLI exited successfully but the locked plugin was not installed and enabled' })
      return { ...plan, results, status: 'partial-failure' }
    }
    results.push({ id: component.id, status: 'installed' })
  }
  return { ...plan, results, status: 'complete' }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, archive, ...args] = process.argv.slice(2)
    if (!['plan', 'install'].includes(command) || !archive) throw new Error('Usage: official-cli.mjs plan|install <archive.dshpack> --home <absolute-path> --profile <name> [--cli <absolute-entry> --confirm]')
    const options = {}
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--confirm') { options.confirm = true; continue }
      if (!['--home', '--profile', '--cli'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Invalid option: ${args[i]}`)
      options[args[i].slice(2)] = args[++i]
    }
    const result = command === 'plan'
      ? await planOfficialPack(await inspectPack(archive), options)
      : await installOfficialPack(archive, options)
    console.log(JSON.stringify(result, null, 2))
    if (result.blocked || result.status === 'partial-failure') process.exitCode = 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
