import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import Icons from 'unplugin-icons/vite'
import { defineConfig, loadEnv } from 'vite'

import { createAssetRouting } from './plugins/asset-routing.ts'
import { buildInfo } from './plugins/build-info.ts'
import { bootProgress } from './plugins/boot-progress.ts'
import { htmlMinify } from './plugins/html-minify.ts'
import { serviceWorker } from './plugins/service-worker.ts'

/** 取 node_modules 下的包目录名作为分包标识（含 scope，如 `@heroui-react`）。 */
function packageChunkName(moduleId: string): string | null {
  // 跳过 pnpm 的 `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/` 中转目录。
  const match = moduleId.replace(/\\/g, '/').match(/node_modules\/(?!\.pnpm\/)((?:@[^/]+\/)?[^/]+)(?:\/|$)/)
  if (!match) return null
  return match[1].replace(/\//g, '-')
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '')
  const routing = createAssetRouting(env.ASSETS_CDN, env.ASSETS_ORIGIN_MAX_BYTES)

  return {
    plugins: [
      react(),
      tailwindcss(),
      Icons({ compiler: 'jsx', jsx: 'react', autoInstall: false }),
      buildInfo(),
      routing.plugin(),
      bootProgress(routing),
      serviceWorker(routing),
      htmlMinify(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      // 本地 file: 链接的包保持源码形态（不预打包），否则改动不会热更新、且会用到过期缓存。
      exclude: ['minecraft-404-page', 'isbinaryfile-browser', 'avatars'],
    },
    build: {
      chunkImportMap: true,
      rolldownOptions: {
        output: {
          chunkFileNames: routing.chunkFileNames,
          assetFileNames: routing.assetFileNames,
          // 按 `node_modules/<package>/` 分包：每个依赖各自成 chunk，hash 稳定，
          // 配合 Service Worker 缓存即可增量更新（只重新下载变化的包）。
          codeSplitting: {
            groups: [
              {
                debugName: 'icons',
                test: /virtual:icons[\\/]/,
                name: 'icons',
              },
              {
                debugName: 'node-modules',
                test: /node_modules/,
                name: (moduleId) => packageChunkName(moduleId),
              },
            ],
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/socket.io': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          ws: true,
        },
        '/mcp': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  }
})
