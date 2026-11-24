import { Buffer } from 'node:buffer'

import type { Plugin } from 'vite'

const DEFAULT_ORIGIN_MAX_BYTES = 16 * 1024
const IMPORT_MAP_FILE = 'importmap.json'

type BundleEntry = {
  type?: string
  code?: string
  source?: string | Uint8Array
}

function bundleSize(entry: BundleEntry | undefined): number | null {
  if (!entry) return null
  const source = entry.type === 'asset' ? entry.source : entry.code
  if (source == null) return null
  return Buffer.byteLength(typeof source === 'string' ? source : Buffer.from(source))
}

function readPositiveInteger(raw: string | undefined): number {
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : DEFAULT_ORIGIN_MAX_BYTES
}

export function joinUrl(base: string, key: string): string {
  const prefix = base.endsWith('/') ? base : `${base}/`
  return prefix + key.replace(/^\.?\//, '')
}

export function createAssetRouting(assetsCdnValue: string | undefined, originMaxBytesValue?: string) {
  const assetsCdn = assetsCdnValue?.replace(/\/+$/, '') ?? ''
  const originMaxBytes = readPositiveInteger(originMaxBytesValue)
  const routeForSize = (size: number | null): 'cdn' | 'origin' =>
    assetsCdn && size !== null && size > originMaxBytes ? 'cdn' : 'origin'
  const urlForFile = (base: string, filename: string, size: number | null) =>
    routeForSize(size) === 'cdn' ? joinUrl(assetsCdn, filename) : joinUrl(base, filename)

  return {
    assetsCdn,
    originMaxBytes,
    cdnAssetPrefix: assetsCdn ? joinUrl(assetsCdn, 'assets/') : '',
    chunkFileNames: 'assets/[name].[hash].js',
    assetFileNames: 'assets/[name].[hash][extname]',
    routeForSize,
    urlForFile,
    plugin(): Plugin {
      let base = '/'
      const rewriteUrls = (bundle: Record<string, BundleEntry>, html: string) =>
        html.replace(/(src|href)="(\/assets\/[^"]+)"/g, (match, attr: string, url: string) => {
          const filename = url.slice(1).split(/[?#]/)[0]
          const size = bundleSize(bundle[filename])
          if (size === null) return match
          return `${attr}="${urlForFile(base, filename, size)}"`
        })

      const rewriteImportMap = (bundle: Record<string, BundleEntry>) => {
        const importMap = bundle[IMPORT_MAP_FILE]
        if (importMap?.type !== 'asset' || importMap.source == null) return
        const source = typeof importMap.source === 'string'
          ? importMap.source
          : new TextDecoder().decode(importMap.source)
        const content = JSON.parse(source) as { imports?: Record<string, string> }
        for (const [key, value] of Object.entries(content.imports ?? {})) {
          if (!value.startsWith('/assets/')) continue
          const filename = value.slice(1)
          const size = bundleSize(bundle[filename])
          if (size !== null) content.imports![key] = urlForFile(base, filename, size)
        }
        importMap.source = JSON.stringify(content)
      }

      return {
        name: 'ta-asset-routing',
        apply: 'build',
        enforce: 'post',
        configResolved(config) {
          base = config.base || '/'
        },
        transformIndexHtml: {
          order: 'post',
          handler(html, ctx) {
            if (!assetsCdn) return html
            const bundle = (ctx.bundle || {}) as Record<string, BundleEntry>
            rewriteImportMap(bundle)
            const rewritten = rewriteUrls(bundle, html)
            const preconnect = `<link rel="preconnect" href="${new URL(assetsCdn).origin}" crossorigin />`
            return rewritten.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${preconnect}`)
          },
        },
      }
    },
  }
}

export type AssetRouting = ReturnType<typeof createAssetRouting>
