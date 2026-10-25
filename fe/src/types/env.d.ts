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
  /** 是否启用 AI 功能（助手、报告预评分、听答评分、学情报告）；设为 true 或 1 时开启 */
  readonly VITE_ENABLE_AI?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
