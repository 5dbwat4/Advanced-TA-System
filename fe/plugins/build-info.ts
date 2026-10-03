import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import git from 'isomorphic-git'
import { readPackageJSON } from 'pkg-types'
import type { Plugin } from 'vite'

const feRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = path.resolve(feRoot, '..')

type ChangelogEntry = { hash: string; date: string; subject: string; body: string }

type ThirdPartyLicense = {
  name: string
  version: string
  description: string
  homepage: string
  author: string
  license: string
  licenseText: string
}

function formatDate(timestamp: number, timezoneOffset: number): string {
  return new Date((timestamp - timezoneOffset * 60) * 1000).toISOString().slice(0, 10)
}

async function readGitInfo(): Promise<{ hash: string; changelog: ChangelogEntry[] }> {
  try {
    const commits = await git.log({ fs, dir: repoRoot, depth: 30 })
    if (commits.length === 0) return { hash: 'dev', changelog: [] }
    return {
      hash: commits[0].oid.slice(0, 7),
      changelog: commits.map((entry) => {
        const [subject = '', ...rest] = entry.commit.message.split('\n')
        return {
          hash: entry.oid.slice(0, 7),
          date: formatDate(entry.commit.author.timestamp, entry.commit.author.timezoneOffset),
          subject,
          body: rest.join('\n').trim(),
        }
      }),
    }
  } catch {
    return { hash: 'dev', changelog: [] }
  }
}

function readLicenseField(license: unknown): string {
  if (typeof license === 'string' && license.length > 0) return license
  if (license !== null && typeof license === 'object' && 'type' in license) {
    const type = (license as { type?: unknown }).type
    if (typeof type === 'string' && type.length > 0) return type
  }
  return 'UNKNOWN'
}

function readUrl(value: unknown): string {
  if (typeof value === 'string') return value
  if (value !== null && typeof value === 'object' && 'url' in value) {
    const url = (value as { url?: unknown }).url
    if (typeof url === 'string') return url
  }
  return ''
}

function readPerson(value: unknown): string {
  if (typeof value === 'string') return value
  if (value !== null && typeof value === 'object') {
    const person = value as { name?: unknown; email?: unknown; url?: unknown }
    const parts: string[] = []
    if (typeof person.name === 'string' && person.name.length > 0) parts.push(person.name)
    if (typeof person.email === 'string' && person.email.length > 0) {
      parts.push(`<${person.email}>`)
    }
    if (typeof person.url === 'string' && person.url.length > 0) parts.push(`(${person.url})`)
    return parts.join(' ')
  }
  return ''
}

function collectPackageDirs(): string[] {
  const virtualStore = [
    path.resolve(repoRoot, 'node_modules/.pnpm'),
    path.resolve(feRoot, 'node_modules/.pnpm'),
  ].find((dir) => fs.existsSync(dir))
  if (!virtualStore) return []
  const dirs: string[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(virtualStore, { withFileTypes: true })
  } catch {
    return dirs
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    const modules = path.join(virtualStore, entry.name, 'node_modules')
    let children: fs.Dirent[]
    try {
      children = fs.readdirSync(modules, { withFileTypes: true })
    } catch {
      continue
    }
    for (const child of children) {
      if (!child.isDirectory() || child.isSymbolicLink() || child.name.startsWith('.')) continue
      const childPath = path.join(modules, child.name)
      if (child.name.startsWith('@')) {
        let scoped: fs.Dirent[]
        try {
          scoped = fs.readdirSync(childPath, { withFileTypes: true })
        } catch {
          continue
        }
        for (const sub of scoped) {
          if (!sub.isDirectory() || sub.isSymbolicLink()) continue
          dirs.push(path.join(childPath, sub.name))
        }
      } else {
        dirs.push(childPath)
      }
    }
  }
  return dirs
}

function readLicenseText(dir: string): string {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return ''
  }
  const rank = (name: string) => {
    const lower = name.toLowerCase()
    if (lower === 'license') return 0
    if (lower === 'license.md') return 1
    if (lower === 'license.txt') return 2
    return 3
  }
  const candidates = entries
    .filter((entry) => entry.isFile() && /^licen[cs]e/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  if (candidates.length === 0) {
    const copying = entries.find((entry) => entry.isFile() && /^copying/i.test(entry.name))
    if (copying) candidates.push(copying.name)
  }
  const file = candidates[0]
  if (!file) return ''
  try {
    return fs.readFileSync(path.join(dir, file), 'utf8')
  } catch {
    return ''
  }
}

async function readLicenses(): Promise<ThirdPartyLicense[]> {
  const dirs = collectPackageDirs()
  const metas = await Promise.all(
    dirs.map(async (dir) => {
      try {
        const manifest = path.join(dir, 'package.json')
        if (!fs.existsSync(manifest)) return null
        const pkg = (await readPackageJSON(manifest)) as unknown as {
          name?: unknown
          version?: unknown
          description?: unknown
          homepage?: unknown
          author?: unknown
          license?: unknown
        }
        const name = typeof pkg.name === 'string' ? pkg.name : ''
        if (name.length === 0) return null
        return {
          name,
          version: typeof pkg.version === 'string' ? pkg.version : '',
          description: typeof pkg.description === 'string' ? pkg.description : '',
          homepage: readUrl(pkg.homepage),
          author: readPerson(pkg.author),
          license: readLicenseField(pkg.license),
          licenseText: readLicenseText(dir),
        }
      } catch {
        return null
      }
    }),
  )
  const seen = new Set<string>()
  const result: ThirdPartyLicense[] = []
  for (const meta of metas) {
    if (!meta) continue
    const key = `${meta.name}@${meta.version}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(meta)
  }
  return result.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
}

export function buildInfo(): Plugin {
  return {
    name: 'ta-build-info',
    async config() {
      const { hash, changelog } = await readGitInfo()
      const licenses = await readLicenses()
      return {
        define: {
          __BUILD_HASH__: JSON.stringify(hash),
          __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
          __BUILD_CHANGELOG__: JSON.stringify(changelog),
          __THIRD_PARTY_LICENSES__: JSON.stringify(licenses),
        },
      }
    },
  }
}
