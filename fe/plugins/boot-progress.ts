import type { Plugin } from 'vite'

type BundleEntry = {
  type?: string
  code?: string
  source?: string | Uint8Array
  imports?: string[]
  viteMetadata?: { importedCss?: Set<string> }
}

function isRemote(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

function parseAttrs(text: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    attrs[match[1].toLowerCase()] = match[2]
  }
  return attrs
}

function joinUrl(base: string, key: string): string {
  const prefix = base.endsWith('/') ? base : `${base}/`
  return prefix + key.replace(/^\.?\//, '')
}

function cleanHref(href: string): string {
  return href.split(/[?#]/)[0]
}

function bundleSize(entry: BundleEntry): number {
  const source = entry.type === 'asset' ? entry.source : entry.code
  if (source == null) return 0
  return Buffer.byteLength(typeof source === 'string' ? source : Buffer.from(source))
}

function localHrefs(html: string): {
  entry: string | null
  styles: string[]
  preloads: string[]
} {
  let entry: string | null = null
  const styles: string[] = []
  const preloads: string[] = []

  for (const match of html.matchAll(/<script\b([^>]*)><\/script>/gi)) {
    const attrs = parseAttrs(match[1])
    const src = attrs.src
    if (!src || isRemote(src)) continue
    if ((attrs.type || '').toLowerCase() === 'module' && !entry) entry = src
  }

  for (const match of html.matchAll(/<link\b([^>]*?)\/?>/gi)) {
    const attrs = parseAttrs(match[1])
    const href = attrs.href
    if (!href || isRemote(href)) continue
    const rel = (attrs.rel || '').toLowerCase()
    if (rel === 'stylesheet') styles.push(href)
    else if (rel === 'modulepreload') preloads.push(href)
  }

  return { entry, styles, preloads }
}

/**
 * 把首屏关键资源的 URL 与构建后大小内联进 HTML，供运行时计算真实加载进度。
 *
 * 只注入元数据，不删除/延迟任何 script、stylesheet 或 modulepreload；
 * 首屏仍由浏览器按标准 HTML 关键路径加载。
 */
export function bootProgress(): Plugin {
  let base = '/'

  return {
    name: 'ta-boot-progress',
    apply: 'build',

    configResolved(config) {
      base = config.base || '/'
    },

    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = (ctx.bundle || {}) as Record<string, BundleEntry>
        const { entry, styles, preloads } = localHrefs(html)

        const keyByUrl = new Map<string, string>()
        for (const key of Object.keys(bundle)) {
          keyByUrl.set(joinUrl(base, key), key)
        }

        const assets: Array<{ u: string; s: number }> = []
        const seen = new Set<string>()

        const addKey = (key: string | undefined) => {
          if (!key || seen.has(key)) return
          const output = bundle[key]
          if (!output) return
          seen.add(key)
          assets.push({ u: joinUrl(base, key), s: bundleSize(output) })
          if (output.type === 'chunk') {
            for (const imported of output.imports ?? []) addKey(imported)
            for (const css of output.viteMetadata?.importedCss ?? []) addKey(css)
          }
        }

        const addHref = (href: string | null) => {
          if (!href) return
          addKey(keyByUrl.get(cleanHref(href)))
        }

        const entryKey = entry ? keyByUrl.get(cleanHref(entry)) : undefined
        addKey(entryKey)
        for (const href of styles) addHref(href)
        for (const href of preloads) addHref(href)

        if (assets.length === 0) return html

        const entryUrl = entryKey ? joinUrl(base, entryKey) : ''
        const data = JSON.stringify(assets).replace(/</g, '\\u003c')
        const entryData = JSON.stringify(entryUrl).replace(/</g, '\\u003c')
        const script = `<script>window.__BOOT_ASSETS__=${data};window.__BOOT_ENTRY__=${entryData}</script>`
        const charset = /<meta\s+charset=["'][^"']*["']\s*\/?>/i
        if (charset.test(html)) return html.replace(charset, (meta) => `${meta}${script}`)

        if (!/<head(\s[^>]*)?>/i.test(html)) return html
        return html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${script}`)
      },
    },
  }
}
