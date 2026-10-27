<script setup lang="ts">
import { computed } from 'vue'

import { cn } from '@/lib/utils'
import { UBadge, UButton, UIcon, UInput, USlider } from '@/ui'

import { sectionScore } from './scoring'
import type {
  CriterionCard,
  CriterionCardState,
  CriterionExtras,
  CriterionItem,
  CriterionSection,
} from './types'

const props = defineProps<{
  items: CriterionItem[]
  states: Record<string, CriterionCardState>
  extras: CriterionExtras
}>()

const emit = defineEmits<{
  toggle: [cardId: string]
  'score-change': [cardId: string, score: string]
  'appendix-change': [cardId: string, appendix: string]
  add: [sectionId: string | null]
}>()

type GradingBlock =
  | { kind: 'section'; key: string; section: CriterionSection; cards: CriterionCard[] }
  | { kind: 'card'; key: string; card: CriterionCard; cards: CriterionCard[] }

const blocks = computed<GradingBlock[]>(() => {
  const out: GradingBlock[] = []
  for (const item of props.items) {
    if (item.type === 'section') {
      out.push({
        kind: 'section',
        key: item.id,
        section: item,
        cards: [...item.children, ...(props.extras[item.id] ?? [])],
      })
    } else {
      out.push({ kind: 'card', key: item.id, card: item, cards: [item] })
    }
  }
  for (const card of props.extras.root ?? []) {
    out.push({ kind: 'card', key: card.id, card, cards: [card] })
  }
  return out
})

function isRange(card: CriterionCard): boolean {
  return card.scoreMax.trim() !== ''
}

function rangeMin(card: CriterionCard): number {
  return Number(card.score) || 0
}

function rangeMax(card: CriterionCard): number {
  const min = rangeMin(card)
  return isRange(card) ? Number(card.scoreMax) || min : min
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function chosenValue(card: CriterionCard, state: CriterionCardState | undefined): number {
  const min = rangeMin(card)
  const max = rangeMax(card)
  if (state && state.score.trim() !== '' && Number.isFinite(Number(state.score))) {
    return clamp(Number(state.score), Math.min(min, max), Math.max(min, max))
  }
  return min
}

function displayValue(card: CriterionCard, state: CriterionCardState | undefined): number {
  const value = chosenValue(card, state)
  return isRange(card) ? value : rangeMin(card)
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

function cardClass(card: CriterionCard, state: CriterionCardState | undefined): string {
  const selected = state?.selected ?? false
  return cn(
    'cursor-pointer rounded-xl border border-line bg-elevated p-3 transition-all',
    selected ? 'border-brand-500/40 bg-brand-500/5' : 'opacity-45 hover:opacity-70',
  )
}

function badgeClass(card: CriterionCard): string {
  return card.mode === 'add'
    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    : 'bg-danger/10 text-danger'
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      v-for="block in blocks"
      :key="block.key"
      :class="
        block.kind === 'section'
          ? 'rounded-2xl border border-line bg-sunken p-3'
          : 'contents'
      "
    >
      <div v-if="block.kind === 'section'" class="flex items-center gap-2 text-xs font-semibold">
        <UIcon
          name="i-lucide-rows-3"
          class="h-[13px] w-[13px] shrink-0 text-brand-600 dark:text-brand-300"
        />
        <span class="min-w-0 flex-1 truncate">{{ block.section.title || '未命名小节' }}</span>
        <span class="tabular shrink-0 text-brand-600 dark:text-brand-300">
          {{ formatScore(sectionScore(block.section, props.states, props.extras)) }} 分
        </span>
      </div>

      <div
        :class="
          block.kind === 'section'
            ? 'mt-2 flex flex-col gap-2 border-s border-line ps-3'
            : 'flex flex-col gap-2'
        "
      >
        <div
          v-for="card in block.cards"
          :key="card.id"
          role="button"
          tabindex="0"
          :aria-pressed="props.states[card.id]?.selected ?? false"
          :class="cardClass(card, props.states[card.id])"
          @click="emit('toggle', card.id)"
        >
          <div class="flex items-start gap-2">
            <UBadge
              :color="card.mode === 'add' ? 'success' : 'error'"
              variant="soft"
              size="xs"
              :class="cn('tabular shrink-0 font-semibold', badgeClass(card))"
            >
              {{
                card.mode === 'add'
                  ? `+${formatScore(displayValue(card, props.states[card.id]))}`
                  : `−${formatScore(displayValue(card, props.states[card.id]))}`
              }}
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
          </div>

          <div
            v-if="(props.states[card.id]?.selected ?? false) && isRange(card)"
            class="mt-2 flex items-center gap-2"
            @click.stop
          >
            <USlider
              v-if="rangeMax(card) > rangeMin(card)"
              aria-label="分值"
              class="flex-1"
              :min="rangeMin(card)"
              :max="rangeMax(card)"
              :step="0.5"
              :model-value="chosenValue(card, props.states[card.id])"
              @update:model-value="
                (value) => {
                  if (typeof value === 'number') emit('score-change', card.id, String(value))
                }
              "
            />
            <UInput
              type="number"
              :min="rangeMin(card)"
              :max="rangeMax(card)"
              step="0.5"
              class="w-20 shrink-0"
              aria-label="分值"
              :model-value="props.states[card.id]?.score ?? ''"
              @update:model-value="
                (value) => emit('score-change', card.id, value == null ? '' : String(value))
              "
            />
          </div>

          <div v-if="props.states[card.id]?.selected ?? false" class="mt-2" @click.stop>
            <UInput
              class="w-full"
              placeholder="附注（可选）"
              aria-label="附注"
              :model-value="props.states[card.id]?.appendix ?? ''"
              @update:model-value="
                (value) => emit('appendix-change', card.id, value == null ? '' : String(value))
              "
            />
          </div>
        </div>

        <UButton
          v-if="block.kind === 'section'"
          size="sm"
          color="neutral"
          variant="soft"
          class="self-start"
          @click="emit('add', block.section.id)"
        >
          <UIcon name="i-lucide-plus" class="h-3.5 w-3.5 shrink-0" />
          添加
        </UButton>
      </div>
    </div>

    <UButton size="sm" color="neutral" variant="soft" class="self-start" @click="emit('add', null)">
      <UIcon name="i-lucide-plus" class="h-3.5 w-3.5 shrink-0" />
      添加卡片
    </UButton>
  </div>
</template>
