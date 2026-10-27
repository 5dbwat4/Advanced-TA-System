import hljs from 'highlight.js/lib/core'
import type { LanguageFn } from 'highlight.js'

import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cmake from 'highlight.js/lib/languages/cmake'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import dart from 'highlight.js/lib/languages/dart'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import latex from 'highlight.js/lib/languages/latex'
import less from 'highlight.js/lib/languages/less'
import lua from 'highlight.js/lib/languages/lua'
import makefile from 'highlight.js/lib/languages/makefile'
import markdown from 'highlight.js/lib/languages/markdown'
import matlab from 'highlight.js/lib/languages/matlab'
import perl from 'highlight.js/lib/languages/perl'
import php from 'highlight.js/lib/languages/php'
import python from 'highlight.js/lib/languages/python'
import r from 'highlight.js/lib/languages/r'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import scss from 'highlight.js/lib/languages/scss'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import verilog from 'highlight.js/lib/languages/verilog'
import vhdl from 'highlight.js/lib/languages/vhdl'
import x86asm from 'highlight.js/lib/languages/x86asm'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

import { fileExtension } from './shared'

const LANGUAGES: Record<string, LanguageFn> = {
  bash,
  c,
  cmake,
  cpp,
  csharp,
  css,
  dart,
  go,
  ini,
  java,
  javascript,
  json,
  kotlin,
  latex,
  less,
  lua,
  makefile,
  markdown,
  matlab,
  perl,
  php,
  python,
  r,
  ruby,
  rust,
  scss,
  sql,
  swift,
  typescript,
  verilog,
  vhdl,
  x86asm,
  xml,
  yaml,
}

for (const [name, language] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, language)
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

/** 按文件名推断 highlight.js 语言 id，未知返回 null */
export function highlightLanguage(name: string): string | null {
  if (name.toLowerCase() === 'makefile') return 'makefile'
  return EXTENSION_LANGUAGE[fileExtension(name)] ?? null
}

/** 高亮并返回 HTML；失败或语言未注册时返回 null，由调用方退回纯文本 */
export function highlightCode(text: string, language: string | null): string | null {
  if (!language || !hljs.getLanguage(language)) return null
  try {
    return hljs.highlight(text, { language, ignoreIllegals: true }).value
  } catch {
    return null
  }
}
