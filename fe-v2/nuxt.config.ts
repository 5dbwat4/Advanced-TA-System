import Icons from 'unplugin-icons/vite'
import progressBar from 'vite-plugin-load-with-progress-bar'

export default defineNuxtConfig({
  // SPA：本应用是登录后使用的控制台（localStorage / socket.io / WebAuthn 都在客户端）
  ssr: false,
  compatibilityDate: '2025-07-15',

  modules: ['@nuxt/ui', '@pinia/nuxt', '@nuxtjs/color-mode'],

  css: ['~/assets/css/main.css'],

  // 组件 auto-import 去掉目录前缀：
  // app/components/ui/AppButton.vue → <AppButton>，app/components/ui/Card.vue → <Card>
  components: [{ path: '~/components', pathPrefix: false }],

  devServer: { port: 5173 },

  colorMode: {
    // 关键：配合 main.css 的 `@custom-variant dark (&:is(.dark *))`，
    // classSuffix 必须是空串（否则 html 上会是 `dark-dark`）
    classSuffix: '',
    preference: 'system',
    fallback: 'light',
    storageKey: 'tasaas-color-mode',
  },

  // 自托管字体，替代 fe/index.html 里国内不可达的 Google Fonts <link>
  // （@nuxt/fonts 随 @nuxt/ui 内置，无需单独安装）
  fonts: {
    families: [
      { name: 'Manrope', provider: 'google', weights: [400, 500, 600, 700, 800], styles: ['normal'] },
      { name: 'Noto Sans SC', provider: 'google', weights: [400, 500, 700], styles: ['normal'] },
      { name: 'JetBrains Mono', provider: 'google', weights: [400, 500, 600], styles: ['normal'] },
    ],
  },

  // ssr: false 没有 Nuxt 服务端可兜底，UIcon 必须能从客户端 bundle 解析图标
  icon: {
    clientBundle: {
      scan: true,
      sizeLimitKb: 1024,
    },
  },

  app: {
    head: {
      title: 'SYS TA Console',
      htmlAttrs: { lang: 'zh-CN' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },

  vite: {
    plugins: [Icons({ compiler: 'vue', autoInstall: false }), progressBar()],
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
  },
})
