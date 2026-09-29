<script setup lang="ts">
/**
 * Markdown —— 只读 Markdown 渲染（对应 `fe/src/components/ui/Markdown.tsx`）
 *
 * 旧版实现：`@uiw/react-md-editor` 的 `MDEditor.Markdown`
 *   （react-markdown + remark-gfm + remark-math + rehype-katex，跟随 next-themes 明暗）
 * Vue 版实现：`md-editor-v3` 的 `MdPreview`（markdown-it 引擎，自带表格 / 任务列表 / KaTeX）
 *
 * API 与旧版保持一致，调用方零改动地逐行翻译：
 *   旧：`<Markdown source={text} />`
 *   新：`<Markdown :source="text" />`
 *
 * 已知调用方：`pages/Terms.vue`、`pages/Questions.tsx`（题目/答案预览）、
 *          `components/checkin/SlaveCard.tsx`（验收内容）
 *
 * ── 与旧版的行为差异（有意为之）────────────────────────────────────
 * 1. 明暗：旧版靠 `data-color-mode` 切换 uiw 内部样式；这里传 `theme` 给 MdPreview，
 *    并在下面的 `<style>` 里用本站 token 覆写颜色，保证两套主题都统一到品牌色。
 * 2. KaTeX：md-editor-v3 默认从 CDN 拉 katex（国内不可达），这里用 `katex` 包
 *    本地注册 instance，不产生任何外部请求。
 * 3. Mermaid：旧版不支持图表，这里显式 `no-mermaid`，避免误触发 CDN 加载。
 * ────────────────────────────────────────────────────────────────
 */
import { config, MdPreview } from 'md-editor-v3'
import katex from 'katex'

import 'katex/dist/katex.min.css'
import 'md-editor-v3/lib/preview.css'

const props = defineProps<{
  /** Markdown 源文本 */
  source: string
  /** 预览容器 id（需要目录联动时才传） */
  id?: string
}>()

/** 用本地 katex 实例，阻止 md-editor-v3 走 CDN */
config({ editorExtensions: { katex: { instance: katex } } })

const colorMode = useColorMode()
const theme = computed(() => (colorMode.value === 'dark' ? 'dark' : 'light'))
</script>

<template>
  <div class="app-markdown">
    <MdPreview
      :id="props.id"
      :model-value="props.source"
      :theme="theme"
      preview-theme="default"
      :no-mermaid="true"
    />
  </div>
</template>

<style>
/*
 * 排版覆写：把 md-editor-v3 的预览样式统一到本站 token。
 * 用原生 CSS（不写 @apply / @theme），避免 SFC 样式块里的 Tailwind 指令依赖 @reference。
 * 选择器统一以 .app-markdown 兜底，不污染其它区域。
 */
.app-markdown .md-editor-preview {
  color: var(--fg);
  font-family: var(--font-sans);
  background: transparent;
  padding: 0;
}

.app-markdown .md-editor-preview h1,
.app-markdown .md-editor-preview h2,
.app-markdown .md-editor-preview h3,
.app-markdown .md-editor-preview h4,
.app-markdown .md-editor-preview h5,
.app-markdown .md-editor-preview h6 {
  color: var(--fg);
  font-weight: 700;
  letter-spacing: -0.01em;
  margin-top: 1.6em;
  margin-bottom: 0.8em;
  line-height: 1.35;
}

.app-markdown .md-editor-preview h1 {
  font-size: 1.6rem;
}

.app-markdown .md-editor-preview h2 {
  font-size: 1.3rem;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--line);
}

.app-markdown .md-editor-preview h3 {
  font-size: 1.1rem;
}

.app-markdown .md-editor-preview h1:first-child,
.app-markdown .md-editor-preview h2:first-child {
  margin-top: 0;
}

.app-markdown .md-editor-preview p {
  margin: 0.8em 0;
  line-height: 1.75;
}

.app-markdown .md-editor-preview a {
  color: var(--brand-600);
  text-decoration: none;
  transition: color 150ms var(--ease-out-expo);
}

.app-markdown .md-editor-preview a:hover {
  color: var(--brand-500);
  text-decoration: underline;
}

:where(.dark *) .app-markdown .md-editor-preview a {
  color: var(--brand-300);
}

.app-markdown .md-editor-preview strong {
  color: var(--fg);
  font-weight: 700;
}

.app-markdown .md-editor-preview ul,
.app-markdown .md-editor-preview ol {
  margin: 0.8em 0;
  padding-left: 1.4em;
}

.app-markdown .md-editor-preview li {
  margin: 0.35em 0;
  line-height: 1.7;
}

.app-markdown .md-editor-preview ul {
  list-style: disc;
}

.app-markdown .md-editor-preview ol {
  list-style: decimal;
}

.app-markdown .md-editor-preview ul ul,
.app-markdown .md-editor-preview ol ol,
.app-markdown .md-editor-preview ul ol,
.app-markdown .md-editor-preview ol ul {
  margin: 0.3em 0;
}

.app-markdown .md-editor-preview blockquote {
  margin: 1em 0;
  padding: 0.6em 1em;
  border-left: 3px solid var(--brand-500);
  border-radius: 0 0.5rem 0.5rem 0;
  background: var(--bg-sunken);
  color: var(--fg-muted);
}

.app-markdown .md-editor-preview blockquote p {
  margin: 0.3em 0;
}

.app-markdown .md-editor-preview code {
  font-family: var(--font-mono);
  font-size: 0.9em;
  padding: 0.15em 0.4em;
  border-radius: 0.375rem;
  background: var(--bg-sunken);
  color: var(--fg);
}

.app-markdown .md-editor-preview pre {
  margin: 1em 0;
  padding: 1em;
  border-radius: 0.75rem;
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  overflow-x: auto;
}

.app-markdown .md-editor-preview pre code {
  padding: 0;
  background: transparent;
}

.app-markdown .md-editor-preview hr {
  margin: 1.6em 0;
  border: 0;
  border-top: 1px solid var(--line);
}

.app-markdown .md-editor-preview table {
  width: 100%;
  margin: 1em 0;
  border-collapse: collapse;
  font-size: 0.925em;
}

.app-markdown .md-editor-preview th,
.app-markdown .md-editor-preview td {
  border: 1px solid var(--line);
  padding: 0.5em 0.75em;
  text-align: left;
}

.app-markdown .md-editor-preview th {
  background: var(--bg-sunken);
  color: var(--fg);
  font-weight: 600;
}

.app-markdown .md-editor-preview img {
  max-width: 100%;
  border-radius: 0.5rem;
}
</style>
