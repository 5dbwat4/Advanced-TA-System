<script setup lang="ts">
import type { ClassValue } from 'clsx'
import hljs from 'highlight.js'
// @ts-expect-error katex/contrib/auto-render ships no type declarations
import renderMathInElement from 'katex/contrib/auto-render'
import MarkdownIt from 'markdown-it'
import { computed, nextTick, onMounted, useSlots, useTemplateRef, watch } from 'vue'

import 'github-markdown-css/github-markdown.css'
import 'katex/dist/katex.min.css'

import { cn } from '@/lib/utils'

const props = defineProps<{
  text?: string
  class?: ClassValue
}>()

const slots = useSlots()

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(code, language) {
    if (language && hljs.getLanguage(language)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(code, { language, ignoreIllegals: true }).value}</code></pre>`
      } catch {
        // fall through to escaped output
      }
    }
    return `<pre class="hljs"><code>${new MarkdownIt().utils.escapeHtml(code)}</code></pre>`
  },
})

function vnodeText(nodes: unknown): string {
  if (typeof nodes === 'string' || typeof nodes === 'number') return String(nodes)
  if (Array.isArray(nodes)) return nodes.map((node) => vnodeText(node)).join('')
  if (nodes && typeof nodes === 'object' && 'children' in nodes) {
    return vnodeText((nodes as { children: unknown }).children)
  }
  return ''
}

const source = computed(() => props.text ?? vnodeText(slots.default?.() ?? []))
const html = computed(() => md.render(source.value))

const root = useTemplateRef<HTMLDivElement>('root')

function renderMath() {
  if (!root.value) return
  renderMathInElement(root.value, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '$', right: '$', display: false },
      { left: '\\(', right: '\\)', display: false },
      { left: '\\[', right: '\\]', display: true },
    ],
    throwOnError: false,
  })
}

watch(html, async () => {
  await nextTick()
  renderMath()
})

onMounted(renderMath)
</script>

<template>
  <div ref="root" :class="cn('markdown-body', props.class)" v-html="html" />
</template>
