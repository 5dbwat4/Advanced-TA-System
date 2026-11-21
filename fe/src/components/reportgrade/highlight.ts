import type { LanguageFn } from 'highlight.js'

import { fileExtension } from './shared'

type LanguageLoader = () => Promise<{ default: LanguageFn }>

const LANGUAGE_LOADERS: Record<string, LanguageLoader> = {
  bash: () => import('highlight.js/lib/languages/bash'),
  c: () => import('highlight.js/lib/languages/c'),
  cmake: () => import('highlight.js/lib/languages/cmake'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  css: () => import('highlight.js/lib/languages/css'),
  dart: () => import('highlight.js/lib/languages/dart'),
  go: () => import('highlight.js/lib/languages/go'),
  ini: () => import('highlight.js/lib/languages/ini'),
  java: () => import('highlight.js/lib/languages/java'),
  javascript: () => import('highlight.js/lib/languages/javascript'),
  json: () => import('highlight.js/lib/languages/json'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
  latex: () => import('highlight.js/lib/languages/latex'),
  less: () => import('highlight.js/lib/languages/less'),
  lua: () => import('highlight.js/lib/languages/lua'),
  makefile: () => import('highlight.js/lib/languages/makefile'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  matlab: () => import('highlight.js/lib/languages/matlab'),
  perl: () => import('highlight.js/lib/languages/perl'),
  php: () => import('highlight.js/lib/languages/php'),
  python: () => import('highlight.js/lib/languages/python'),
  r: () => import('highlight.js/lib/languages/r'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
  rust: () => import('highlight.js/lib/languages/rust'),
  scss: () => import('highlight.js/lib/languages/scss'),
  sql: () => import('highlight.js/lib/languages/sql'),
  swift: () => import('highlight.js/lib/languages/swift'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  verilog: () => import('highlight.js/lib/languages/verilog'),
  vhdl: () => import('highlight.js/lib/languages/vhdl'),
  x86asm: () => import('highlight.js/lib/languages/x86asm'),
  xml: () => import('highlight.js/lib/languages/xml'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
}

const EXTENSION_LANGUAGE: Record<string, string> = {
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  cs: 'csharp',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  py: 'python',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  svg: 'xml',
  css: 'css',
  scss: 'scss',
  less: 'less',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  mk: 'makefile',
  cmake: 'cmake',
  md: 'markdown',
  v: 'verilog',
  sv: 'verilog',
  vhd: 'vhdl',
  asm: 'x86asm',
  s: 'x86asm',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  php: 'php',
  pl: 'perl',
  lua: 'lua',
  dart: 'dart',
  swift: 'swift',
  sql: 'sql',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  conf: 'ini',
  cfg: 'ini',
  tex: 'latex',
  r: 'r',
  m: 'matlab',
}

let corePromise: Promise<typeof import('highlight.js/lib/core')> | null = null
const registered = new Set<string>()

function loadCore() {
  corePromise ??= import('highlight.js/lib/core')
  return corePromise
}

/** 按文件名推断 highlight.js 语言 id，未知返回 null */
export function highlightLanguage(name: string): string | null {
  if (name.toLowerCase() === 'makefile') return 'makefile'
  return EXTENSION_LANGUAGE[fileExtension(name)] ?? null
}

/** 按需加载语言并高亮；失败或语言未注册时返回 null，由调用方退回纯文本 */
export async function highlightCode(
  text: string,
  language: string | null,
): Promise<string | null> {
  if (!language) return null
  const loader = LANGUAGE_LOADERS[language]
  if (!loader) return null

  try {
    const core = (await loadCore()).default
    if (!registered.has(language)) {
      const module = await loader()
      core.registerLanguage(language, module.default)
      registered.add(language)
    }
    return core.highlight(text, { language, ignoreIllegals: true }).value
  } catch {
    return null
  }
}
