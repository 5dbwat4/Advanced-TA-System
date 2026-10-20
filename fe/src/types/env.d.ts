/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** hCaptcha 站点密钥；未配置时不渲染验证组件 */
  readonly VITE_HCAPTCHA_SITEKEY?: string
  /** Sentry 前端 DSN；未配置时不初始化 Sentry */
  readonly VITE_SENTRY_DSN?: string
  /** Sentry 环境名；默认使用 Vite 的 MODE */
  readonly VITE_SENTRY_ENVIRONMENT?: string
  /** Sentry 性能追踪采样率（0-1）；默认 0.1 */
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
