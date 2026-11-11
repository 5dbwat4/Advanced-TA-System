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
 * - bootProgress 会往 head 内联首屏资源清单与进度脚本，压缩时一并折叠空白；
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
