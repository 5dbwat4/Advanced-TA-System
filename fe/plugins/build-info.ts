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
  licenseTextIndex: number
}

type RawThirdPartyLicense = Omit<ThirdPartyLicense, 'licenseTextIndex'> & {
  licenseText: string
}

type LicenseBlock = string | number[]

type ThirdPartyLicenseData = {
  licenses: ThirdPartyLicense[]
  licenseTexts: number[][]
  licenseBlocks: LicenseBlock[]
  licenseLines: string[]
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

const BLANK_LINE = /^[ \t\r]*$/

function splitLicenseParagraphs(text: string): string[] {
  const lines = text.split('\n')
  const parts: string[] = []
  let start = 0
  for (let index = 0; index < lines.length; index += 1) {
    const isBoundary =
      BLANK_LINE.test(lines[index]) &&
      (index + 1 === lines.length || !BLANK_LINE.test(lines[index + 1]))
    if (!isBoundary) continue
    parts.push(lines.slice(start, index + 1).join('\n'))
    start = index + 1
  }
  if (start < lines.length) parts.push(lines.slice(start).join('\n'))
  return parts
}

async function readLicenses(): Promise<ThirdPartyLicenseData> {
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
  const result: RawThirdPartyLicense[] = []
  for (const meta of metas) {
    if (!meta) continue
    const key = `${meta.name}@${meta.version}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(meta)
  }
  result.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))

  const allLines: string[] = []
  const allLineIds = new Map<string, number>()
  const internLine = (line: string): number => {
    const existing = allLineIds.get(line)
    if (existing !== undefined) return existing
    const id = allLines.length
    allLines.push(line)
    allLineIds.set(line, id)
    return id
  }

  const paragraphIds = new Map<string, number>()
  const paragraphs: string[] = []
  const paragraphLines: number[][] = []
  const licenseTexts: number[][] = []
  for (const meta of result) {
    const refs: number[] = []
    for (const paragraph of splitLicenseParagraphs(meta.licenseText)) {
      let id = paragraphIds.get(paragraph)
      if (id === undefined) {
        id = paragraphs.length
        paragraphs.push(paragraph)
        paragraphLines.push(paragraph.split('\n').map(internLine))
        paragraphIds.set(paragraph, id)
      }
      refs.push(id)
    }
    licenseTexts.push(refs)
  }

  const lineUsage = new Uint32Array(allLines.length)
  for (const ids of paragraphLines) {
    for (const id of new Set(ids)) lineUsage[id] += 1
  }

  const lineCosts = allLines.map((line) => JSON.stringify(line).length)
  const lineIds = new Map<number, number>()
  const licenseLines: string[] = []
  const licenseBlocks: LicenseBlock[] = []
  for (let index = 0; index < paragraphs.length; index += 1) {
    const ids = paragraphLines[index]
    let exclusiveCost = 0
    for (const id of new Set(ids)) {
      if (lineUsage[id] === 1) exclusiveCost += lineCosts[id] + 1
    }
    const idsCost = JSON.stringify(ids).length + exclusiveCost
    if (JSON.stringify(paragraphs[index]).length < idsCost) {
      licenseBlocks.push(paragraphs[index])
      continue
    }
    licenseBlocks.push(
      ids.map((id) => {
        let mapped = lineIds.get(id)
        if (mapped === undefined) {
          mapped = licenseLines.length
          licenseLines.push(allLines[id])
          lineIds.set(id, mapped)
        }
        return mapped
      }),
    )
  }

  const licenses: ThirdPartyLicense[] = result.map((meta, index) => ({
    name: meta.name,
    version: meta.version,
    description: meta.description,
    homepage: meta.homepage,
    author: meta.author,
    license: meta.license,
    licenseTextIndex: index,
  }))

  return { licenses, licenseTexts, licenseBlocks, licenseLines }
}

export function buildInfo(): Plugin {
  return {
    name: 'ta-build-info',
    async config() {
      const { hash, changelog } = await readGitInfo()
      const { licenses, licenseTexts, licenseBlocks, licenseLines } = await readLicenses()
      return {
        define: {
          __BUILD_HASH__: JSON.stringify(hash),
          __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
          __BUILD_CHANGELOG__: JSON.stringify(changelog),
          __THIRD_PARTY_LICENSES__: JSON.stringify(licenses),
          __THIRD_PARTY_LICENSE_TEXTS__: JSON.stringify(licenseTexts),
          __THIRD_PARTY_LICENSE_BLOCKS__: JSON.stringify(licenseBlocks),
          __THIRD_PARTY_LICENSE_LINES__: JSON.stringify(licenseLines),
        },
      }
    },
  }
}
