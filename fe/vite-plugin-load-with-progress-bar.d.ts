declare module 'vite-plugin-load-with-progress-bar' {
  import type { Plugin } from 'vite'

  interface ProgressBarOptions {
    root?: string
    loader?: string
    copy?: boolean
  }

  export default function progressBarPlugin(options?: ProgressBarOptions): Plugin
}
