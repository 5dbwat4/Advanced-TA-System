<script setup lang="ts">
import { computed } from 'vue'

import { UBadge, UIcon } from '@/ui'

import type { CriterionCard, CriterionItem, CriterionSection } from './types'

const props = defineProps<{
  items: CriterionItem[]
}>()

type PreviewBlock =
  | { kind: 'section'; key: string; section: CriterionSection; cards: CriterionCard[] }
  | { kind: 'card'; key: string; card: CriterionCard; cards: CriterionCard[] }

const blocks = computed<PreviewBlock[]>(() =>
  props.items.map((item) =>
    item.type === 'section'
      ? { kind: 'section', key: item.id, section: item, cards: item.children }
      : { kind: 'card', key: item.id, card: item, cards: [item] },
  ),
)

function scoreRange(card: CriterionCard): string {
  const value = card.score.trim() === '' ? '?' : card.score.trim()
  return card.scoreMax.trim() === '' ? value : `${value}~${card.scoreMax.trim()}`
}
</script>

<template>
  <p v-if="props.items.length === 0" class="py-8 text-center text-xs text-fg-subtle">
    评分标准为空
  </p>

  <div v-else class="flex max-h-[50vh] flex-col gap-3 overflow-auto">
    <div
      v-for="block in blocks"
      :key="block.key"
      :class="
        block.kind === 'section'
          ? 'rounded-xl border border-line bg-sunken p-3'
          : 'contents'
      "
    >
      <div v-if="block.kind === 'section'" class="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <UIcon
          name="i-lucide-rows-3"
          class="h-[13px] w-[13px] shrink-0 text-brand-600 dark:text-brand-300"
        />
        <span class="min-w-0 flex-1 truncate">{{ block.section.title || '未命名小节' }}</span>
        <UBadge v-if="block.section.init.trim() !== ''" color="primary" variant="subtle" size="xs">
          初始分 {{ block.section.init }}
        </UBadge>
        <UBadge v-if="block.section.cap.trim() !== ''" color="primary" variant="subtle" size="xs">
          上限 {{ block.section.cap }}
        </UBadge>
      </div>

      <div
        :class="
          block.kind === 'section'
            ? 'mt-2 flex flex-col gap-1.5 border-s border-line ps-3'
            : 'flex flex-col gap-1.5'
        "
      >
        <div
          v-for="card in block.cards"
          :key="card.id"
          class="flex items-start gap-2 rounded-lg border border-line bg-elevated px-2.5 py-2"
        >
          <UBadge
            :color="card.mode === 'add' ? 'success' : 'error'"
            variant="soft"
            size="xs"
            class="tabular shrink-0 font-semibold"
          >
            {{ card.mode === 'add' ? `+${scoreRange(card)}` : `−${scoreRange(card)}` }}
          </UBadge>
          <div class="min-w-0 flex-1">
            <div class="text-xs font-medium">{{ card.rule || '（未填写规则）' }}</div>
            <div
              v-if="card.detail.trim() !== ''"
              class="mt-0.5 whitespace-pre-wrap text-[11px] text-fg-subtle"
            >
              {{ card.detail }}
            </div>
          </div>
          <UBadge v-if="card.defaultSelected" color="primary" variant="subtle" size="xs">
            默认
          </UBadge>
        </div>
      </div>
    </div>
  </div>
</template>
