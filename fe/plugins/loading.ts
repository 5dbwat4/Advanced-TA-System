import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { minifySync } from 'vite'
import type { Plugin } from 'vite'

const loadingDir = fileURLToPath(new URL('./loading', import.meta.url))

const LOADER_CSS = [
  // 顶部细进度条：不遮挡页面，页面可立即渲染与交互。
  '.pb-bar{position:fixed;top:0;left:0;right:0;height:3px;z-index:2147483647;pointer-events:none;opacity:1;transition:opacity .35s ease}',
  '.pb-bar.pb-hide{opacity:0}',
  '.pb-track{position:absolute;inset:0;background:rgba(79,82,226,.14);overflow:hidden}',
  '.pb-fill{height:100%;width:0;border-radius:0 2px 2px 0;background:linear-gradient(90deg,#4f52e2,#8b5cf6);box-shadow:0 0 8px rgba(79,82,226,.45);transition:width .2s ease}',
  '.pb-bar.pb-ind .pb-fill{width:32%;animation:pb-slide 1.2s ease-in-out infinite}',
  '@keyframes pb-slide{0%{transform:translateX(-110%)}100%{transform:translateX(320%)}}',
  // 只有 manifest 加载失败才展示全屏错误态。
  '.pb-fatal{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:24px;background:#fafbff;color:#1b1e2e;font:14px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;text-align:center}',
  '.pb-fatal p{margin:0}',
  '.pb-fatal button{margin-top:14px;border:0;border-radius:8px;background:#4f52e2;color:#fff;font-size:13px;font-weight:600;padding:8px 22px;cursor:pointer}',
  '.pb-fatal button:hover{background:#4144cf}',
  '@media(prefers-color-scheme:dark){.pb-track{background:rgba(148,163,255,.18)}.pb-fatal{background:#101218;color:#e9ebf4}}',
  '@media(prefers-reduced-motion:reduce){.pb-fill,.pb-bar{transition:none}.pb-bar.pb-ind .pb-fill{animation:none;width:100%;opacity:.55}}',
].join('')

const SHELL =
  '<div id="pb-bar" class="pb-bar pb-ind" role="progressbar" aria-label="正在加载资源" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
  '<div class="pb-track"><div id="pb-fill" class="pb-fill"></div></div>' +
  '</div>'

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

function hash(text: string, length: number): string {
  return createHash('sha256').update(text).digest('hex').slice(0, length)
}

function minify(filename: string, code: string): string {
  return minifySync(filename, code, { compress: true, mangle: true }).code
}

function bundleSize(bundle: Record<string, unknown>, key: string): number | null {
  const output = bundle[key] as { type?: string; code?: string; source?: string | Uint8Array } | undefined
  if (!output) return null
  const source = output.type === 'asset' ? output.source : output.code
  if (source == null) return null
  return Buffer.byteLength(typeof source === 'string' ? source : Buffer.from(source))
}

/**
 * 收集入口脚本与样式表（并从 HTML 中移除），首屏资源改为由 manifest.json + 加载器注入。
 */
function stripTrackedTags(html: string): { html: string; entry: string | null; styles: string[] } {
  let entry: string | null = null
  const styles: string[] = []

  let out = html.replace(/<script\b([^>]*)><\/script>/gi, (full, attrText: string) => {
    const src = parseAttrs(attrText).src
    if (!src || isRemote(src)) return full
    if (!entry) entry = src
    return ''
  })

  out = out.replace(/<link\b([^>]*?)\/?>/gi, (full, attrText: string) => {
    const attrs = parseAttrs(attrText)
    const rel = (attrs.rel || '').toLowerCase()
    const href = attrs.href
    if (!href || isRemote(href)) return full
    if (rel === 'modulepreload') return ''
    if (rel === 'stylesheet') {
      styles.push(href)
      return ''
    }
    return full
  })

  return { html: out, entry, styles }
}

function listPublicFiles(dir: string): Array<{ rel: string; size: number }> {
  const files: Array<{ rel: string; size: number }> = []
  if (!dir || !fs.existsSync(dir)) return files
  const walk = (current: string) => {
    for (const dirEntry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, dirEntry.name)
      if (dirEntry.isDirectory()) walk(full)
      else if (dirEntry.isFile()) {
        files.push({ rel: path.relative(dir, full).split(path.sep).join('/'), size: fs.statSync(full).size })
      }
    }
  }
  walk(dir)
  return files
}

/**
 * 构建时把 index.html 改造成“顶部进度条 + 按需加载”的版本：
 * - manifest.json：独立文件，列出全部资源与大小；其内容哈希写入 sw.js（manifest 变化 → sw.js 变化 → 浏览器触发更新）。
 * - loader.js：独立、带内容哈希、已 minify 的小文件（不再内联进 HTML）。
 * - sw.js：minify 后输出到根目录；后台按 manifest 预加载 chunk，并广播进度。
 */
export function loading(): Plugin {
  let base = '/'
  let publicDir = ''
  let emitted = false
  let emitAsset: ((asset: { type: 'asset'; fileName: string; source: string | Uint8Array }) => string) | null = null

  return {
    name: 'ta-loading',
    apply: 'build',

    configResolved(config) {
      base = config.base || '/'
      publicDir = config.publicDir || ''
    },

    buildStart() {
      emitAsset = (asset) => this.emitFile(asset)
    },

    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (emitted || !/<\/body>/i.test(html)) return html
        const { html: stripped, entry, styles } = stripTrackedTags(html)
        if (!entry) return html
        emitted = true

        const bundle = (ctx.bundle || {}) as Record<string, unknown>

        const seen = new Set<string>()
        const assets: Array<{ u: string; s: number | null }> = []
        const addAsset = (url: string, size: number | null) => {
          if (seen.has(url)) return
          seen.add(url)
          assets.push({ u: url, s: size })
        }

        for (const key of Object.keys(bundle)) {
          if (/\.html?$/i.test(key) || key === 'sw.js' || key === 'manifest.json' || /(^|\/)loader\./.test(key)) continue
          addAsset(joinUrl(base, key), bundleSize(bundle, key))
        }
        for (const file of listPublicFiles(publicDir)) {
          addAsset(joinUrl(base, file.rel), file.size)
        }

        // loader：独立文件 + 内容哈希 + minify。
        const loaderSource = fs.readFileSync(path.join(loadingDir, 'loader.js'), 'utf8').replace(/__BASE_URL__/g, base)
        const loaderCode = minify('loader.js', loaderSource)
        const loaderFile = `assets/loader.${hash(loaderCode, 8)}.js`

        // manifest 内容哈希：写入 sw.js 作为版本，manifest 变化即触发 SW 更新。
        const version = hash(JSON.stringify({ entry, styles, assets, loader: loaderFile }), 16)

        // sw.js：注入版本后 minify。
        const swSource = fs.readFileSync(path.join(loadingDir, 'sw.js'), 'utf8').replace(/__BUILD_VERSION__/g, version)
        emitAsset?.({ type: 'asset', fileName: 'sw.js', source: minify('sw.js', swSource) })
        emitAsset?.({ type: 'asset', fileName: loaderFile, source: loaderCode })
        emitAsset?.({
          type: 'asset',
          fileName: 'manifest.json',
          source: JSON.stringify({ v: version, base, entry, styles, assets }),
        })

        let out = stripped.replace(/<\/head>/i, `<style id="__pb_style">${LOADER_CSS}</style></head>`)
        out = out.replace(
          /<\/body>/i,
          `${SHELL}<script src="${joinUrl(base, loaderFile)}"></script></body>`,
        )
        return out
      },
    },
  }
}
