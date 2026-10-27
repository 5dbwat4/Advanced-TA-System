<script setup lang="ts">
import { computed } from 'vue'

import { UEditor, UEditorToolbar } from '@/ui'

const props = withDefaults(
  defineProps<{
    modelValue: string
    height?: number
  }>(),
  {
    height: 240,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const value = computed({
  get: () => props.modelValue,
  set: (next) => emit('update:modelValue', next),
})

const items = [
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: '加粗' } },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: '斜体' } },
    { kind: 'mark', mark: 'code', icon: 'i-lucide-code', tooltip: { text: '行内代码' } },
  ],
  [
    {
      icon: 'i-lucide-heading',
      tooltip: { text: '标题' },
      items: [
        { kind: 'heading', level: 1, label: '标题 1' },
        { kind: 'heading', level: 2, label: '标题 2' },
        { kind: 'heading', level: 3, label: '标题 3' },
      ],
    },
    {
      icon: 'i-lucide-list',
      tooltip: { text: '列表' },
      items: [
        { kind: 'bulletList', icon: 'i-lucide-list', label: '无序列表' },
        { kind: 'orderedList', icon: 'i-lucide-list-ordered', label: '有序列表' },
      ],
    },
    { kind: 'blockquote', icon: 'i-lucide-text-quote', tooltip: { text: '引用' } },
  ],
  [
    { kind: 'codeBlock', icon: 'i-lucide-square-code', tooltip: { text: '代码块' } },
    { kind: 'link', icon: 'i-lucide-link', tooltip: { text: '链接' } },
  ],
]
</script>

<template>
  <div class="flex flex-col" :style="{ minHeight: `${props.height}px` }">
    <UEditor
      v-slot="{ editor }"
      v-model="value"
      content-type="markdown"
      placeholder="在此输入 Markdown…"
      class="flex-1 overflow-hidden rounded-xl border border-line bg-elevated"
    >
      <UEditorToolbar :editor="editor" :items="items" />
    </UEditor>
  </div>
</template>
