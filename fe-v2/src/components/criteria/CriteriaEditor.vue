<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { computed } from 'vue'

import IconAction from '@/components/ui/IconAction.vue'
import { cn } from '@/lib/utils'
import {
  UButton,
  UCheckbox,
  UDropdownMenu,
  UIcon,
  UInput,
  UTextarea,
} from '@/ui'

import {
  createCard,
  createSection,
  type CriterionCard,
  type CriterionItem,
  type CriterionSection,
} from './types'

const props = defineProps<{
  items: CriterionItem[]
}>()

const emit = defineEmits<{
  'update:items': [items: CriterionItem[]]
}>()

type EditorBlock =
  | { kind: 'section'; key: string; section: CriterionSection; cards: CriterionCard[] }
  | { kind: 'card'; key: string; card: CriterionCard; cards: CriterionCard[] }

const blocks = computed<EditorBlock[]>(() =>
  props.items.map((item) =>
    item.type === 'section'
      ? { kind: 'section', key: item.id, section: item, cards: item.children }
      : { kind: 'card', key: item.id, card: item, cards: [item] },
  ),
)

const addMenuItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: '添加卡片',
      icon: 'i-lucide-square-plus',
      onSelect: () => emit('update:items', [...props.items, createCard()]),
    },
    {
      label: '添加小节块',
      icon: 'i-lucide-rows-3',
      onSelect: () => emit('update:items', [...props.items, createSection()]),
    },
  ],
])

function asText(value: unknown): string {
  return value == null ? '' : String(value)
}

function updateCard(cardId: string, patch: Partial<CriterionCard>) {
  emit(
    'update:items',
    props.items.map((item): CriterionItem => {
      if (item.type === 'card') {
        return item.id === cardId ? { ...item, ...patch } : item
      }
      return {
        ...item,
        children: item.children.map((child) =>
          child.id === cardId ? { ...child, ...patch } : child,
        ),
      }
    }),
  )
}

function updateSection(
  sectionId: string,
  patch: Partial<Pick<CriterionSection, 'title' | 'init' | 'cap'>>,
) {
  emit(
    'update:items',
    props.items.map((item) =>
      item.id === sectionId && item.type === 'section' ? { ...item, ...patch } : item,
    ),
  )
}

function removeItem(itemId: string) {
  emit(
    'update:items',
    props.items.filter((item) => item.id !== itemId),
  )
}

function removeCard(cardId: string) {
  emit(
    'update:items',
    props.items.flatMap((item): CriterionItem[] => {
      if (item.type === 'card') return item.id === cardId ? [] : [item]
      return [{ ...item, children: item.children.filter((child) => child.id !== cardId) }]
    }),
  )
}

function addCardToSection(sectionId: string) {
  emit(
    'update:items',
    props.items.map((item) =>
      item.type === 'section' && item.id === sectionId
        ? { ...item, children: [...item.children, createCard()] }
        : item,
    ),
  )
}

function modeClass(card: CriterionCard, mode: 'add' | 'subtract'): string {
  const active = card.mode === mode
  return cn(
    'px-2.5 py-1.5 transition-colors',
    mode === 'subtract' && 'border-l border-line',
    active
      ? mode === 'add'
        ? 'bg-emerald-500/10 font-semibold text-emerald-600 dark:text-emerald-400'
        : 'bg-danger/10 font-semibold text-danger'
      : 'text-fg-muted hover:text-fg',
  )
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
      <div v-if="block.kind === 'section'" class="flex items-center gap-2">
        <UIcon name="i-lucide-rows-3" class="h-[15px] w-[15px] shrink-0 text-brand-600 dark:text-brand-300" />
        <UInput
          class="min-w-0 flex-1"
          placeholder="小节标题，例如：实验过程"
          aria-label="小节标题"
          :model-value="block.section.title"
          @update:model-value="(value) => updateSection(block.section.id, { title: asText(value) })"
        />
        <div class="flex shrink-0 items-center gap-1.5 text-xs text-fg-muted">
          <span>初始分</span>
          <UInput
            type="number"
            step="0.5"
            class="w-20"
            placeholder="0"
            aria-label="小节初始分"
            :model-value="block.section.init"
            @update:model-value="(value) => updateSection(block.section.id, { init: asText(value) })"
          />
        </div>
        <div class="flex shrink-0 items-center gap-1.5 text-xs text-fg-muted">
          <span>上限</span>
          <UInput
            type="number"
            min="0"
            step="0.5"
            class="w-20"
            placeholder="不限"
            aria-label="小节分数上限"
            :model-value="block.section.cap"
            @update:model-value="(value) => updateSection(block.section.id, { cap: asText(value) })"
          />
        </div>
        <IconAction label="删除小节" variant="ghost" @click="removeItem(block.section.id)">
          <UIcon name="i-lucide-trash-2" class="h-[15px] w-[15px] shrink-0" />
        </IconAction>
      </div>

      <div
        :class="
          block.kind === 'section'
            ? 'mt-3 flex flex-col gap-2 border-s border-line ps-3'
            : 'flex flex-col gap-2'
        "
      >
        <div
          v-for="card in block.cards"
          :key="card.id"
          class="rounded-xl border border-line bg-elevated p-3"
        >
          <div class="flex items-center gap-2">
            <div class="flex shrink-0 overflow-hidden rounded-lg border border-line text-xs">
              <button
                type="button"
                :class="modeClass(card, 'add')"
                @click="updateCard(card.id, { mode: 'add' })"
              >
                加分
              </button>
              <button
                type="button"
                :class="modeClass(card, 'subtract')"
                @click="updateCard(card.id, { mode: 'subtract' })"
              >
                减分
              </button>
            </div>
            <UInput
              class="min-w-0 flex-1"
              placeholder="写在评语中的规则，例如：未画出流水线图"
              aria-label="评语规则"
              :model-value="card.rule"
              @update:model-value="(value) => updateCard(card.id, { rule: asText(value) })"
            />
            <IconAction label="删除" variant="ghost" @click="removeCard(card.id)">
              <UIcon name="i-lucide-trash-2" class="h-[15px] w-[15px] shrink-0" />
            </IconAction>
          </div>

          <UTextarea
            class="mt-2 w-full"
            :rows="2"
            variant="soft"
            placeholder="详细标准"
            aria-label="详细标准"
            :model-value="card.detail"
            @update:model-value="(value) => updateCard(card.id, { detail: asText(value) })"
          />

          <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <div class="flex items-center gap-1.5 text-xs text-fg-muted">
              <span>{{ card.mode === 'add' ? '加分' : '扣分' }}</span>
              <UInput
                type="number"
                min="0"
                step="0.5"
                class="w-20"
                placeholder="分值"
                :aria-label="card.mode === 'add' ? '加分数目' : '扣分数目'"
                :model-value="card.score"
                @update:model-value="(value) => updateCard(card.id, { score: asText(value) })"
              />
              <span class="text-fg-subtle">至</span>
              <UInput
                type="number"
                min="0"
                step="0.5"
                class="w-20"
                placeholder="可选"
                aria-label="分数范围上限"
                :model-value="card.scoreMax"
                @update:model-value="(value) => updateCard(card.id, { scoreMax: asText(value) })"
              />
            </div>
            <div class="ms-auto flex items-center gap-2">
              <UCheckbox
                aria-label="默认选中"
                :model-value="card.defaultSelected"
                @update:model-value="(value) => updateCard(card.id, { defaultSelected: value === true })"
              />
              <span class="text-xs text-fg-muted">默认选中</span>
            </div>
          </div>
        </div>

        <UButton
          v-if="block.kind === 'section'"
          size="sm"
          color="neutral"
          variant="soft"
          class="self-start"
          @click="addCardToSection(block.section.id)"
        >
          <UIcon name="i-lucide-plus" class="h-3.5 w-3.5 shrink-0" />
          添加卡片
        </UButton>
      </div>
    </div>

    <div
      v-if="props.items.length === 0"
      class="rounded-2xl border border-dashed border-line py-10 text-center text-xs text-fg-subtle"
    >
      还没有评分项，点击下方「添加卡片」开始
    </div>

    <UDropdownMenu :items="addMenuItems">
      <UButton color="neutral" variant="soft" class="self-start">
        <UIcon name="i-lucide-plus" class="h-[15px] w-[15px] shrink-0" />
        添加卡片
      </UButton>
    </UDropdownMenu>
  </div>
</template>
