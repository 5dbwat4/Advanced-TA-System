export type DocHeading = {
  id: string
  text: string
  level: number
}

export type Doc = {
  slug: string
  title: string
  description: string
  content: string
  headings: DocHeading[]
  order: number
}

const rawDocs = import.meta.glob('../../../docs/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const rawAssets = import.meta.glob('../../../docs/*.{png,jpg,jpeg,gif,webp,svg}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

const PREFERRED_ORDER = [
  'welcome',
  'auth-and-users',
  'add-new-user-for-your-course',
  'viewer-main',
  'how-to-read-student-summary',
  'checkoff-and-queue',
]

function normalizePath(input: string): string {
  const parts: string[] = []
  for (const segment of input.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      parts.pop()
      continue
    }
    parts.push(segment)
  }
  return parts.join('/')
}

function dirname(input: string): string {
  const index = input.lastIndexOf('/')
  return index === -1 ? '' : input.slice(0, index)
}

const assetMap = new Map<string, string>()
for (const [key, url] of Object.entries(rawAssets)) {
  assetMap.set(normalizePath(key), url)
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\p{L}\p{N}\-_]+/gu, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'section'
  )
}

function resolveImage(mdKey: string, url: string): string | null {
  if (/^(?:[a-z]+:)?\/\//i.test(url) || url.startsWith('/') || url.startsWith('data:')) {
    return null
  }
  const candidate = normalizePath(`${dirname(mdKey)}/${url}`)
  return assetMap.get(candidate) ?? null
}

function isDocLink(url: string): boolean {
  if (/^(?:[a-z]+:)?\/\//i.test(url) || url.startsWith('/') || url.startsWith('#')) return false
  return !/\.(?:png|jpe?g|gif|webp|svg|pdf)$/i.test(url)
}

function docSlugFromLink(url: string): string {
  const clean = url.split('#')[0].split('?')[0].replace(/\.md$/i, '')
  const name = clean.slice(clean.lastIndexOf('/') + 1)
  return name
}

/** 把相对图片与文档链接重写为可在前端直接使用的地址 */
function rewriteLinks(source: string, mdKey: string): string {
  return source.replace(
    /(!?)\[([^\]]*)\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g,
    (full, bang: string, label: string, url: string, title: string) => {
      if (bang) {
        const resolved = resolveImage(mdKey, url)
        return resolved ? `![${label}](${resolved}${title})` : full
      }
      if (isDocLink(url)) {
        return `[${label}](/docs/${docSlugFromLink(url)}${title})`
      }
      return full
    },
  )
}

type Frontmatter = {
  data: Record<string, string>
  body: string
}

function parseFrontmatter(raw: string): Frontmatter {
  const text = raw.replace(/^\uFEFF/, '')
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!match) return { data: {}, body: text }

  const data: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const entry = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (!entry) continue
    let value = entry[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    data[entry[1]] = value
  }

  return { data, body: text.slice(match[0].length) }
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~>#]/g, '')
    .trim()
}

function extractTitle(source: string, slug: string): string {
  let inFence = false
  for (const line of source.split(/\r?\n/)) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const match = /^#\s+(.+?)\s*$/.exec(line)
    if (match) return stripInlineMarkdown(match[1])
  }
  return slug
    .split('-')
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ')
}

function extractDescription(source: string): string {
  let inFence = false
  for (const line of source.split(/\r?\n/)) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    const trimmed = line.trim()
    if (inFence || !trimmed || trimmed.startsWith('#') || trimmed.startsWith('>')) continue
    if (trimmed.startsWith('|') || trimmed.startsWith('-')) continue
    const text = stripInlineMarkdown(trimmed)
    if (text) return text.length > 120 ? `${text.slice(0, 120)}…` : text
  }
  return ''
}

function extractHeadings(source: string): DocHeading[] {
  const headings: DocHeading[] = []
  const seen = new Map<string, number>()
  let inFence = false

  for (const line of source.split(/\r?\n/)) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const match = /^(#{1,4})\s+(.+?)\s*$/.exec(line)
    if (!match) continue
    const text = stripInlineMarkdown(match[2])
    if (!text) continue
    const base = slugify(text)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    headings.push({
      id: count === 0 ? base : `${base}-${count}`,
      text,
      level: match[1].length,
    })
  }

  return headings
}

const docs: Doc[] = Object.entries(rawDocs)
  .map(([key, raw]) => {
    const slug = normalizePath(key).slice('docs/'.length).replace(/\.md$/i, '')
    const { data, body } = parseFrontmatter(raw)
    const source = rewriteLinks(body, normalizePath(key))
    const preferred = PREFERRED_ORDER.indexOf(slug)
    return {
      slug,
      title: data.title?.trim() || extractTitle(source, slug),
      description: data.description?.trim() || extractDescription(source),
      content: source,
      headings: extractHeadings(source),
      order: preferred === -1 ? PREFERRED_ORDER.length : preferred,
    }
  })
  .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))

export const DOCS = docs

export const DOC_MAP = new Map(docs.map((doc) => [doc.slug, doc]))

export const FIRST_DOC = docs[0]
