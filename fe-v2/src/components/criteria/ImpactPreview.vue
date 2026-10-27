<script setup lang="ts">
import { computed } from 'vue'

import { cn } from '@/lib/utils'
import { UAlert, UBadge, UIcon, UProgress } from '@/ui'

import type { CriteriaImpactChange, CriteriaImpactItem } from './impact'
import { cardValue } from './scoring'
import type { CriterionCard, CriterionCardState, CriterionItem } from './types'

const props = defineProps<{
  item: CriteriaImpactItem
  oldItems: CriterionItem[]
}>()

type ImpactCardEntry = {
  card: CriterionCard
  state: CriterionCardState | undefined
  value: number
  change: CriteriaImpactChange | undefined
}

type ImpactBlock =
  | {
      kind: 'section'
      key: string
      title: string
      sectionChange: CriteriaImpactChange | undefined
      cards: ImpactCardEntry[]
    }
  | { kind: 'card'; key: string; cards: ImpactCardEntry[] }

type DefRow = { label: string; card: CriterionCard }

const cardChange = computed(() => {
  const map = new Map<string, CriteriaImpactChange>()
  for (const change of props.item.changes) {
    if (change.kind !== 'section') map.set(change.cardId, change)
  }
  return map
})

const sectionChange = computed(() => {
  const map = new Map<string, CriteriaImpactChange>()
  for (const change of props.item.changes) {
    if (change.kind === 'section') map.set(change.cardId, change)
  }
  return map
})

const addedCards = computed(() => {
  const out: CriterionCard[] = []
  for (const change of props.item.changes) {
    if (change.kind === 'added' && change.afterCard) out.push(change.afterCard)
  }
  return out
})

function entryOf(card: CriterionCard): ImpactCardEntry {
  const state = props.item.states[card.id]
  return {
    card,
    state,
    value: cardValue(card, state),
    change: cardChange.value.get(card.id),
  }
}

const blocks = computed<ImpactBlock[]>(() => {
  const out: ImpactBlock[] = []
  for (const node of props.oldItems) {
    if (node.type === 'section') {
      out.push({
        kind: 'section',
        key: node.id,
        title: node.title || '未命名小节',
        sectionChange: sectionChange.value.get(node.id),
        cards: [...node.children, ...(props.item.extras[node.id] ?? [])].map(entryOf),
      })
    } else {
      out.push({ kind: 'card', key: node.id, cards: [entryOf(node)] })
    }
  }
  for (const card of props.item.extras.root ?? []) {
    out.push({ kind: 'card', key: card.id, cards: [entryOf(card)] })
  }
  for (const card of addedCards.value) {
    out.push({ kind: 'card', key: `added-${card.id}`, cards: [entryOf(card)] })
  }
  return out
})

const changedCount = computed(
  () => props.item.changes.filter((change) => change.kind !== 'section').length,
)

const totalCards = computed(() =>
  blocks.value.reduce((total, block) => total + block.cards.length, 0),
)

const impactPercent = computed(() =>
  totalCards.value === 0 ? 0 : Math.min(100, (changedCount.value / totalCards.value) * 100),
)

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

function scoreRange(card: CriterionCard): string {
  return card.scoreMax.trim() === '' ? card.score : `${card.score}~${card.scoreMax}`
}

function defsOf(change: CriteriaImpactChange | undefined): DefRow[] {
  const out: DefRow[] = []
  if (change?.beforeCard) out.push({ label: '原先评分标准', card: change.beforeCard })
  if (change?.afterCard) out.push({ label: '更改后评分标准', card: change.afterCard })
  return out
}

function alertColor(change: CriteriaImpactChange | undefined): 'error' | 'warning' | 'info' {
  if (change?.kind === 'removed') return 'error'
  if (change?.kind === 'added') return 'info'
  return 'warning'
}

function alertIcon(change: CriteriaImpactChange | undefined): string {
  if (change?.kind === 'removed') return 'i-lucide-trash-2'
  if (change?.kind === 'added') return 'i-lucide-plus'
  if (change?.kind === 'range-out') return 'i-lucide-triangle-alert'
  return 'i-lucide-info'
}

function cardClass(entry: ImpactCardEntry): string {
  return cn(
    'rounded-xl border bg-elevated p-2.5',
    entry.change ? 'border-amber-500/60 ring-1 ring-amber-500/30' : 'border-line',
    !(entry.state?.selected ?? false) && 'opacity-50',
  )
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div>
      <div class="text-sm font-semibold text-fg">
        {{ props.item.name }}
        <span class="tabular ml-2 text-[11px] font-normal text-fg-subtle">
          {{ props.item.studentId }}
        </span>
      </div>
      <div class="text-xs text-fg-muted">
        {{ props.item.experimentMark }} · {{ props.item.experimentTitle }}
      </div>
    </div>

    <div>
      <div class="mb-1 flex items-center justify-between text-[11px] text-fg-subtle">
        <span>受影响卡片</span>
        <span class="tabular">{{ changedCount }} / {{ totalCards }}</span>
      </div>
      <UProgress :model-value="impactPercent" size="sm" color="warning" />
    </div>

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
        <div
          v-if="block.kind === 'section'"
          class="flex flex-wrap items-center gap-2 text-xs font-semibold"
        >
          <UIcon
            name="i-lucide-rows-3"
            class="h-[13px] w-[13px] shrink-0 text-brand-600 dark:text-brand-300"
          />
          <span class="min-w-0 flex-1 truncate">{{ block.title }}</span>
          <UBadge v-if="block.sectionChange" color="warning" variant="soft" size="xs">
            {{ block.sectionChange.message }}
          </UBadge>
        </div>

        <div
          :class="
            block.kind === 'section'
              ? 'mt-2 flex flex-col gap-1.5 border-s border-line ps-3'
              : 'flex flex-col gap-1.5'
          "
        >
          <div v-for="entry in block.cards" :key="entry.card.id" :class="cardClass(entry)">
            <div class="flex items-start gap-2">
              <UBadge
                :color="
                  !(entry.state?.selected ?? false)
                    ? 'neutral'
                    : entry.card.mode === 'add'
                      ? 'success'
                      : 'error'
                "
                variant="soft"
                size="xs"
                class="tabular shrink-0 font-semibold"
              >
                <template v-if="entry.state?.selected ?? false">
                  {{
                    entry.card.mode === 'add'
                      ? `+${formatScore(entry.value)}`
                      : `−${formatScore(Math.abs(entry.value))}`
                  }}
                </template>
                <template v-else>未选</template>
              </UBadge>
              <div class="min-w-0 flex-1">
                <div class="text-xs font-medium">
                  {{ entry.card.rule || '（未填写规则）' }}
                </div>
                <div
                  v-if="entry.card.detail.trim() !== ''"
                  class="mt-0.5 whitespace-pre-wrap text-[11px] text-fg-subtle"
                >
                  {{ entry.card.detail }}
                </div>
                <div
                  v-if="(entry.state?.appendix.trim() ?? '') !== ''"
                  class="mt-1 whitespace-pre-wrap text-[11px] text-fg-muted"
                >
                  附注：{{ entry.state?.appendix }}
                </div>
              </div>
            </div>

            <UAlert
              v-if="entry.change"
              class="mt-1.5"
              :color="alertColor(entry.change)"
              variant="soft"
              :icon="alertIcon(entry.change)"
              :title="entry.change.message"
            />

            <div
              v-if="entry.change?.beforeCard || entry.change?.afterCard"
              class="mt-2 flex flex-col gap-1.5"
            >
              <div
                v-for="def in defsOf(entry.change)"
                :key="def.label"
                class="rounded-lg border border-line bg-elevated p-2"
              >
                <div class="text-[10px] font-semibold text-fg-subtle">{{ def.label }}</div>
                <div class="mt-1 flex items-start gap-2">
                  <UBadge
                    :color="def.card.mode === 'add' ? 'success' : 'error'"
                    variant="soft"
                    size="xs"
                    class="tabular shrink-0 font-semibold"
                  >
                    {{
                      def.card.mode === 'add'
                        ? `+${scoreRange(def.card)}`
                        : `−${scoreRange(def.card)}`
                    }}
                  </UBadge>
                  <div class="min-w-0 flex-1">
                    <div class="text-[11px] font-medium">
                      {{ def.card.rule || '（未填写规则）' }}
                    </div>
                    <div
                      v-if="def.card.detail.trim() !== ''"
                      class="mt-0.5 whitespace-pre-wrap text-[10px] text-fg-subtle"
                    >
                      {{ def.card.detail }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
