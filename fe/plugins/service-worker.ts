import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { minifySync } from 'vite'
import type { Plugin } from 'vite'

import { joinUrl } from './asset-routing.ts'

const swDir = fileURLToPath(new URL('./service-worker', import.meta.url))
const SW_FILE = 'sw.js'
const MANIFEST_FILE = 'manifest.json'
const IMPORT_MAP_FILE = 'importmap.json'

function hash(text: string, length: number): string {
  return createHash('sha256').update(text).digest('hex').slice(0, length)
}

function minify(filename: string, code: string): string {
  return minifySync(filename, code, { compress: true, mangle: true }).code
}

function bundleSize(bundle: Record<string, unknown>, key: string): number | null {
  const output = bundle[key] as
    | { type?: string; code?: string; source?: string | Uint8Array }
    | undefined
  if (!output) return null
  const source = output.type === 'asset' ? output.source : output.code
  if (source == null) return null
  return Buffer.byteLength(typeof source === 'string' ? source : Buffer.from(source))
}

function listPublicFiles(dir: string): Array<{ rel: string; size: number }> {
  const files: Array<{ rel: string; size: number }> = []
  if (!dir || !fs.existsSync(dir)) return files
  const walk = (current: string) => {
    for (const dirEntry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, dirEntry.name)
      if (dirEntry.isDirectory()) walk(full)
      else if (dirEntry.isFile()) {
        files.push({
          rel: path.relative(dir, full).split(path.sep).join('/'),
          size: fs.statSync(full).size,
        })
      }
    }
  }
  walk(dir)
  return files
}

export function serviceWorker(): Plugin {
  let base = '/'
  let publicDir = ''
  let emitted = false

  return {
    name: 'ta-service-worker',
    apply: 'build',

    configResolved(config) {
      base = config.base || '/'
      publicDir = config.publicDir || ''
    },

    buildStart() {
      emitted = false
    },

    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (emitted) return html
        emitted = true

        const bundle = (ctx.bundle || {}) as Record<string, unknown>
        const seen = new Set<string>()
        const assets: Array<{ u: string; s: number | null }> = []
        const addAsset = (filename: string, size: number | null) => {
          const url = joinUrl(base, filename)
          if (seen.has(url)) return
          seen.add(url)
          assets.push({ u: url, s: size })
        }

        for (const key of Object.keys(bundle)) {
          if (
            /\.html?$/i.test(key) ||
            key === SW_FILE ||
            key === MANIFEST_FILE ||
            key === IMPORT_MAP_FILE
          ) continue
          addAsset(key, bundleSize(bundle, key))
        }
        for (const file of listPublicFiles(publicDir)) addAsset(file.rel, file.size)

        const runtimeSource = fs.readFileSync(path.join(swDir, 'runtime-bootstrap.js'), 'utf8')
        const version = hash(JSON.stringify({ assets, html, runtimeSource }), 16)
        const swSource = fs
          .readFileSync(path.join(swDir, SW_FILE), 'utf8')
          .replace(/__BUILD_VERSION__/g, () => version)

        const context = this as unknown as {
          emitFile: (asset: { type: 'asset'; fileName: string; source: string }) => void
        }
        context.emitFile({ type: 'asset', fileName: SW_FILE, source: minify(SW_FILE, swSource) })
        context.emitFile({
          type: 'asset',
          fileName: MANIFEST_FILE,
          source: JSON.stringify({
            v: version,
            base,
            assets,
          }),
        })

        const runtimeScript = `<script>${minify('runtime-bootstrap.js', runtimeSource)}</script>`
        const charset = /<meta\s+charset=["'][^"']*["']\s*\/?>/i
        if (charset.test(html)) return html.replace(charset, (meta) => `${meta}${runtimeScript}`)
        return html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${runtimeScript}`)
      },
    },
  }
}
