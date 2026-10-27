<script setup lang="ts">
import { computed, ref } from 'vue'

import PreferenceRow from '@/components/settings/PreferenceRow.vue'
import Markdown from '@/components/ui/Markdown.vue'
import type { MarkdownStyleId } from '@/lib/api'
import { cn } from '@/lib/utils'
import { UButton, UIcon, UModal } from '@/ui'

const OPTIONS: { id: MarkdownStyleId; title: string; desc: string }[] = [
  { id: 'github', title: 'github markdown', desc: '经典 GitHub 文档排版风格' },
  { id: 'prose', title: 'tailwind prose', desc: 'Tailwind Typography 阅读排版风格' },
]

const PREVIEW = [
  '## 标题示例',
  '',
  '这是一段正文，包含 **加粗**、*斜体* 与 `行内代码`。',
  '',
  '- 无序列表项一',
  '- 无序列表项二',
  '- 无序列表项三',
  '',
  '1. 有序列表项一',
  '2. 有序列表项二',
  '',
  '> 引用文本示例',
  '',
  '```ts',
  'const answer: number = 42',
  '```',
  '',
  '| 列 A | 列 B |',
  '| --- | --- |',
  '| 1 | 2 |',
].join('\n')

const props = defineProps<{
  value: MarkdownStyleId
}>()

const emit = defineEmits<{
  change: [value: MarkdownStyleId]
  'update:value': [value: MarkdownStyleId]
}>()

const open = ref(false)
const current = computed(() => OPTIONS.find((option) => option.id === props.value) ?? OPTIONS[0])

function choose(id: MarkdownStyleId) {
  emit('change', id)
  emit('update:value', id)
  open.value = false
}

function optionIcon(id: MarkdownStyleId): string {
  return id === 'github' ? 'i-lucide-github' : 'i-lucide-pilcrow'
}
</script>

<template>
  <PreferenceRow title="倾向使用的Markdown样式" :hint="current.desc">
    <UButton size="sm" color="neutral" variant="soft" @click="open = true">
      <UIcon :name="optionIcon(current.id)" class="h-4 w-4 shrink-0" />
      {{ current.title }}
      <UIcon name="i-lucide-chevron-down" class="h-3.5 w-3.5 shrink-0" />
    </UButton>
  </PreferenceRow>

  <UModal
    v-model:open="open"
    title="选择 Markdown 样式"
    description="该样式将应用于题目、答案等 Markdown 内容的展示，点击卡片即可选择。"
  >
    <template #body>
      <div class="grid gap-3 sm:grid-cols-2">
        <div
          v-for="option in OPTIONS"
          :key="option.id"
          role="button"
          tabindex="0"
          :aria-pressed="option.id === value"
          :class="
            cn(
              'relative flex cursor-pointer flex-col gap-3 rounded-2xl border-2 p-4 text-left transition-all',
              option.id === value
                ? 'border-brand-500 bg-brand-500/5 ring-2 ring-brand-500/25'
                : 'border-line hover:border-brand-500/40',
            )
          "
          @click="choose(option.id)"
          @keydown.enter.prevent="choose(option.id)"
          @keydown.space.prevent="choose(option.id)"
        >
          <div class="flex items-center gap-2">
            <span
              :class="
                cn(
                  'flex',
                  option.id === value
                    ? 'text-brand-600 dark:text-brand-300'
                    : 'text-fg-muted',
                )
              "
            >
              <UIcon :name="optionIcon(option.id)" class="h-4 w-4 shrink-0" />
            </span>
            <span class="text-sm font-bold text-fg">{{ option.title }}</span>
          </div>
          <p class="text-xs text-fg-subtle">{{ option.desc }}</p>
          <div class="h-72 overflow-y-auto overscroll-contain rounded-xl border border-line bg-sunken p-4">
            <Markdown :text="PREVIEW" />
          </div>
          <span
            v-if="option.id === value"
            class="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white shadow-md"
          >
            <UIcon name="i-lucide-check" class="h-3 w-3 shrink-0" />
          </span>
        </div>
      </div>
    </template>
  </UModal>
</template>