/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** hCaptcha 站点密钥；未配置时不渲染验证组件 */
  readonly VITE_HCAPTCHA_SITEKEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
