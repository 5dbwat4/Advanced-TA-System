import { minify } from 'html-minifier-terser'
import type { Options } from 'html-minifier-terser'
import type { Plugin } from 'vite'

const OPTIONS: Options = {
  collapseWhitespace: true,
  removeComments: true,
  keepClosingSlash: true,
}

/**
 * 构建后压缩 index.html：
 * - loading 插件会从 HTML 中剥离入口 script / 样式与 modulepreload 标签，这些标签通常各占一行，
 *   剥离后会残留大量空行，这里通过折叠空白一并清除；
 * - 顺带移除注释、压缩属性间空白。
 * 需要在 loading() 之后注册（同 order 下按 plugins 数组顺序执行）。
 */
export function htmlMinify(): Plugin {
  return {
    name: 'ta-html-minify',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      async handler(html) {
        return minify(html, OPTIONS)
      },
    },
  }
}
