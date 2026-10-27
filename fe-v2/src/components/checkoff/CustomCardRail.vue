<script setup lang="ts">
import { computed } from 'vue'

import Markdown from '@/components/ui/Markdown.vue'
import type { MarkdownStyleId } from '@/lib/api'
import type { CustomCard, CustomCards } from '@/lib/custom-cards'
import { cn } from '@/lib/utils'
import { UIcon, UTooltip } from '@/ui'

const props = defineProps<{
  customCards: CustomCards
  open: boolean
  activeSlotId: string | null
  markdownStyle: MarkdownStyleId
}>()

const emit = defineEmits<{
  toggle: []
  show: [slotId: string, card: CustomCard]
  cancel: []
}>()

const entries = computed(() => {
  const cardById = new Map(props.customCards.cards.map((card) => [card.id, card]))
  return props.customCards.slots.flatMap((slot) => {
    const card = slot.cardId ? cardById.get(slot.cardId) : null
    return card ? [{ slot, card }] : []
  })
})

function toggleSlot(entry: { slot: { id: string }; card: CustomCard }) {
  if (entry.slot.id === props.activeSlotId) emit('cancel')
  else emit('show', entry.slot.id, entry.card)
}
</script>

<template>
  <div
    v-if="entries.length > 0"
    :class="
      cn(
        'flex flex-col items-center rounded-full border border-line bg-elevated/85 p-1.5 shadow-xl backdrop-blur-xl',
        entries.length > 1 && 'gap-1.5',
      )
    "
  >
    <button
      v-if="entries.length > 1"
      type="button"
      :class="
        cn(
          'flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border transition-colors',
          props.open
            ? 'border-brand-500/25 bg-brand-500/10 text-brand-600 dark:text-brand-300'
            : 'border-brand-600 bg-brand-600 text-white shadow-md shadow-brand-600/25',
        )
      "
      :aria-label="props.open ? '收起自定义 Card' : '展开自定义 Card'"
      :title="props.open ? '收起自定义 Card' : '展开自定义 Card'"
      @click="emit('toggle')"
    >
      <UIcon
        :name="props.open ? 'i-lucide-chevron-up' : 'i-lucide-layout-grid'"
        class="size-4 shrink-0"
      />
    </button>

    <div v-if="entries.length === 1 || props.open" class="flex flex-col items-center gap-1.5">
      <UTooltip
        v-for="entry in entries"
        :key="entry.slot.id"
        :delay-duration="0"
        :content="{ side: 'left' }"
      >
        <button
          type="button"
          :style="{ backgroundColor: entry.card.backgroundColor, color: entry.card.textColor }"
          :class="
            cn(
              'flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-black/10 text-sm font-bold shadow-sm transition-transform hover:scale-105 dark:border-white/15',
              entry.slot.id === props.activeSlotId &&
                'ring-2 ring-brand-500 ring-offset-2 ring-offset-elevated',
            )
          "
          :aria-label="entry.slot.id === props.activeSlotId ? '取消自定义 Card' : '切换到自定义 Card'"
          @click="toggleSlot(entry)"
        >
          <UIcon
            v-if="entry.slot.id === props.activeSlotId"
            name="i-lucide-x"
            class="size-4 shrink-0"
          />
          <template v-else>{{ entry.card.text || '·' }}</template>
        </button>

        <template #content>
          <div
            :class="
              cn(
                'max-h-64 w-80 max-w-[80vw] overflow-y-auto p-3 text-left',
                props.markdownStyle === 'prose' && 'prose dark:prose-invert',
              )
            "
          >
            <p v-if="entry.slot.id === props.activeSlotId" class="text-xs text-fg-muted">
              点击取消 Card
            </p>
            <Markdown v-else-if="entry.card.content.trim()" :text="entry.card.content" />
            <p v-else class="text-xs text-fg-subtle">暂无内容</p>
          </div>
        </template>
      </UTooltip>
    </div>
  </div>
</template>
