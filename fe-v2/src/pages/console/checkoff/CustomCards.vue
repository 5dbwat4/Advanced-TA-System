<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Markdown from '@/components/ui/Markdown.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { useAuthStore } from '@/lib/auth'
import {
  CUSTOM_CARD_COLORS,
  CUSTOM_CARD_CONTENT_MAX,
  CUSTOM_CARD_COUNT_MAX,
  CUSTOM_CARD_TEXT_MAX,
  createDefaultCustomCards,
  readSingleText,
  type CustomCard,
  type CustomCardSlot,
} from '@/lib/custom-cards'
import { getErrorMessage } from '@/lib/error'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { UAlert, UButton, UIcon, UInput, UModal, USwitch, UTextarea } from '@/ui'

type DragPayload = { type: 'slot'; slotId: string } | { type: 'card'; cardId: string } | null

const auth = useAuthStore()
const router = useRouter()

const initial = auth.user?.preferences?.customCards ?? createDefaultCustomCards()
const slots = ref<CustomCardSlot[]>(initial.slots.map((slot) => ({ ...slot })))
const cards = ref<CustomCard[]>(initial.cards.map((card) => ({ ...card })))
const saving = ref(false)

const cardOpen = ref(false)
const editingCardId = ref<string | null>(null)
const cardDraft = ref('')
const slotTextDraft = ref('')
const slotBackgroundDraft = ref('#dbeafe')
const slotTextColorDraft = ref('#1e3a8a')
const showPreview = ref(false)

const dragPayload = ref<DragPayload>(null)
const dragSlotId = ref<string | null>(null)
const dragCardId = ref<string | null>(null)
const overSlotId = ref<string | null>(null)

const saved = computed(
  () => auth.user?.preferences?.customCards ?? createDefaultCustomCards(),
)
const dirty = computed(
  () =>
    JSON.stringify({ slots: slots.value, cards: cards.value }) !==
    JSON.stringify({ slots: saved.value.slots, cards: saved.value.cards }),
)
const markdownStyle = computed(() => auth.user?.preferences?.markdownStyle ?? 'github')
const cardById = computed(() => new Map(cards.value.map((card) => [card.id, card])))
const slotIndexByCard = computed(() => {
  const map = new Map<string, number>()
  slots.value.forEach((slot, index) => {
    if (slot.cardId) map.set(slot.cardId, index)
  })
  return map
})

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function defaultColors(index: number): { backgroundColor: string; textColor: string } {
  const [backgroundColor, textColor] = CUSTOM_CARD_COLORS[index] ?? CUSTOM_CARD_COLORS[0]
  return { backgroundColor, textColor }
}

function cardForSlot(slot: CustomCardSlot): CustomCard | null {
  return slot.cardId ? (cardById.value.get(slot.cardId) ?? null) : null
}

function slotLabel(card: CustomCard): string {
  const index = slotIndexByCard.value.get(card.id)
  return index == null ? '未进入 Slot' : `已进入 Slot ${index + 1}`
}

function slotStyle(slot: CustomCardSlot) {
  const card = cardForSlot(slot)
  return card ? { backgroundColor: card.backgroundColor, color: card.textColor } : undefined
}

function onSlotClick(slot: CustomCardSlot) {
  const card = cardForSlot(slot)
  if (card) openEditCard(card)
}

function openAddCard() {
  if (cards.value.length >= CUSTOM_CARD_COUNT_MAX) {
    toast.error(`最多配置 ${CUSTOM_CARD_COUNT_MAX} 张 Card`)
    return
  }
  const colors = defaultColors(cards.value.length)
  editingCardId.value = null
  cardDraft.value = ''
  slotTextDraft.value = ''
  slotBackgroundDraft.value = colors.backgroundColor
  slotTextColorDraft.value = colors.textColor
  cardOpen.value = true
}

function openEditCard(card: CustomCard) {
  editingCardId.value = card.id
  cardDraft.value = card.content
  slotTextDraft.value = card.text
  slotBackgroundDraft.value = card.backgroundColor
  slotTextColorDraft.value = card.textColor
  cardOpen.value = true
}

function onSlotTextInput(value: string | number) {
  slotTextDraft.value = readSingleText(String(value))
}

function saveCard() {
  if (!cardDraft.value.trim()) {
    toast.error('请先填写 Card 内容')
    return
  }
  const next = {
    content: cardDraft.value.slice(0, CUSTOM_CARD_CONTENT_MAX),
    text: readSingleText(slotTextDraft.value),
    backgroundColor: slotBackgroundDraft.value,
    textColor: slotTextColorDraft.value,
  }
  if (editingCardId.value) {
    const id = editingCardId.value
    cards.value = cards.value.map((card) => (card.id === id ? { ...card, ...next } : card))
  } else {
    cards.value = [...cards.value, { id: createId('card'), ...next }]
  }
  cardOpen.value = false
}

function deleteCard() {
  const id = editingCardId.value
  if (!id) return
  cards.value = cards.value.filter((card) => card.id !== id)
  slots.value = slots.value.map((slot) =>
    slot.cardId === id ? { ...slot, cardId: null } : slot,
  )
  cardOpen.value = false
  toast.success('Card 已删除')
}

function assignCardToSlot(cardId: string, slotId: string) {
  slots.value = slots.value.map((slot) => {
    if (slot.id === slotId) return { ...slot, cardId }
    if (slot.cardId === cardId) return { ...slot, cardId: null }
    return slot
  })
}

function moveSlot(fromId: string, toId: string) {
  const from = slots.value.findIndex((slot) => slot.id === fromId)
  const to = slots.value.findIndex((slot) => slot.id === toId)
  if (from < 0 || to < 0 || from === to) return
  const next = [...slots.value]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  slots.value = next
}

function resetDrag() {
  dragPayload.value = null
  dragSlotId.value = null
  dragCardId.value = null
  overSlotId.value = null
}

function onSlotDragStart(event: DragEvent, slot: CustomCardSlot) {
  dragPayload.value = { type: 'slot', slotId: slot.id }
  dragSlotId.value = slot.id
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', `slot:${slot.id}`)
  }
}

function onCardDragStart(event: DragEvent, card: CustomCard) {
  dragPayload.value = { type: 'card', cardId: card.id }
  dragCardId.value = card.id
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', `card:${card.id}`)
  }
}

function onSlotDragOver(slotId: string) {
  overSlotId.value = slotId
}

function onSlotDragLeave(slotId: string) {
  if (overSlotId.value === slotId) overSlotId.value = null
}

function onSlotDrop(event: DragEvent, slot: CustomCardSlot) {
  event.preventDefault()
  event.stopPropagation()
  const payload = dragPayload.value
  resetDrag()
  if (!payload) return
  if (payload.type === 'slot') moveSlot(payload.slotId, slot.id)
  else assignCardToSlot(payload.cardId, slot.id)
}

function onSlotAreaDrop(event: DragEvent) {
  event.preventDefault()
  const payload = dragPayload.value
  resetDrag()
  if (payload?.type !== 'slot') return
  const slot = slots.value.find((item) => item.id === payload.slotId)
  if (slot?.cardId) {
    slots.value = slots.value.map((item) =>
      item.id === slot.id ? { ...item, cardId: null } : item,
    )
  }
}

async function save() {
  const user = auth.user
  if (!user) return
  saving.value = true
  try {
    await auth.updatePreferences({
      device: user.preferences?.device ?? 'single',
      draw: user.preferences?.draw ?? 'random',
      markdownEditor: user.preferences?.markdownEditor ?? 'uiw',
      markdownStyle: user.preferences?.markdownStyle ?? 'github',
      drawCount: user.preferences?.drawCount ?? 3,
      customCards: { slots: slots.value, cards: cards.value },
    })
    toast.success('自定义 Card 已保存')
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="auth.loading" class="flex min-h-[60vh] items-center justify-center">
    <Spinner />
  </div>

  <div v-else-if="auth.user" class="mx-auto max-w-6xl">
    <PageHeader title="自定义 Card">
      <template #subtitle>配置会跟随偏好保存到后端。</template>
      <template #actions>
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-arrow-left"
          @click="router.push('/console/checkoff')"
        >
          返回验收
        </UButton>
        <UButton
          :loading="saving"
          :disabled="!dirty"
          icon="i-lucide-save"
          @click="save"
        >
          保存
        </UButton>
      </template>
    </PageHeader>

    <UAlert
      class="mb-4"
      color="info"
      icon="i-lucide-info"
      description="拖动 Card 到上方 Slot 进行绑定；拖动 Slot 可调整顺序，拖到空白处可移出 Slot。"
    />

    <Card
      class="mb-5 flex flex-wrap items-center gap-2"
      @dragover.prevent
      @drop="onSlotAreaDrop"
    >
      <button
        v-for="(slot, index) in slots"
        :key="slot.id"
        type="button"
        draggable="true"
        :style="slotStyle(slot)"
        :title="cardForSlot(slot) ? '编辑 Card' : '空 Slot'"
        :class="
          cn(
            'flex h-10 w-10 touch-none items-center justify-center rounded-full border border-black/10 text-sm font-bold shadow-sm transition-all dark:border-white/15',
            cardForSlot(slot)
              ? 'cursor-grab active:cursor-grabbing'
              : 'bg-sunken text-fg-subtle',
            dragSlotId === slot.id && 'opacity-30',
            overSlotId === slot.id && 'ring-2 ring-brand-500/50',
            cardForSlot(slot) && 'ring-2 ring-brand-500/30',
          )
        "
        @dragstart="onSlotDragStart($event, slot)"
        @dragend="resetDrag"
        @dragover.prevent="onSlotDragOver(slot.id)"
        @dragleave="onSlotDragLeave(slot.id)"
        @drop="onSlotDrop($event, slot)"
        @click="onSlotClick(slot)"
      >
        {{ cardForSlot(slot)?.text || index + 1 }}
      </button>

      <UButton class="ml-auto" size="sm" icon="i-lucide-plus" @click="openAddCard">
        添加
      </UButton>
    </Card>

    <section>
      <EmptyState
        v-if="cards.length === 0"
        icon="i-lucide-layout-grid"
        title="还没有 Card"
        hint="点击上方「添加」创建"
      />

      <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="(card, cardIndex) in cards"
          :key="card.id"
          draggable="true"
          :class="cn(dragCardId === card.id && 'opacity-30')"
          @dragstart="onCardDragStart($event, card)"
          @dragend="resetDrag"
        >
          <Card
            :index="cardIndex"
            class="relative flex min-h-48 cursor-grab flex-col pt-10 transition-colors hover:border-brand-500/40 active:cursor-grabbing"
          >
            <span
              class="absolute left-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              :class="
                slotIndexByCard.get(card.id) == null
                  ? 'bg-sunken text-fg-subtle'
                  : 'bg-brand-500/10 text-brand-600 dark:text-brand-300'
              "
            >
              {{ slotLabel(card) }}
            </span>

            <button
              type="button"
              draggable="false"
              class="absolute right-3 top-3 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-line bg-elevated text-fg-muted transition-colors hover:bg-sunken hover:text-fg"
              aria-label="编辑 Card"
              title="编辑 Card"
              @mousedown.stop
              @dragstart.stop.prevent
              @click.stop="openEditCard(card)"
            >
              <UIcon name="i-lucide-pencil" class="size-[13px] shrink-0" />
            </button>

            <div class="max-h-80 overflow-y-auto">
              <Markdown
                v-if="card.content.trim()"
                :text="card.content"
                :class="markdownStyle === 'prose' ? 'prose dark:prose-invert' : undefined"
              />
              <p v-else class="py-8 text-center text-xs text-fg-subtle">暂无内容</p>
            </div>
          </Card>
        </div>
      </div>
    </section>

    <UModal
      v-model:open="cardOpen"
      :title="editingCardId ? '编辑 Card' : '添加 Card'"
      :ui="{ content: 'sm:max-w-2xl' }"
    >
      <template #body>
        <div class="flex flex-col gap-3">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label class="flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
              Slot 文本
              <UInput
                :model-value="slotTextDraft"
                :maxlength="CUSTOM_CARD_TEXT_MAX"
                placeholder="A"
                @update:model-value="onSlotTextInput"
              />
            </label>
            <label
              class="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs text-fg-muted"
            >
              <span class="flex-1">背景色</span>
              <input
                v-model="slotBackgroundDraft"
                type="color"
                class="h-7 w-9 cursor-pointer rounded border border-line bg-transparent p-0.5"
              />
            </label>
            <label
              class="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs text-fg-muted"
            >
              <span class="flex-1">文字色</span>
              <input
                v-model="slotTextColorDraft"
                type="color"
                class="h-7 w-9 cursor-pointer rounded border border-line bg-transparent p-0.5"
              />
            </label>
          </div>

          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-fg-muted">内容</span>
            <label class="flex items-center gap-2 text-xs text-fg-muted">
              <span>预览</span>
              <USwitch v-model="showPreview" aria-label="预览 Markdown" />
            </label>
          </div>

          <UTextarea
            v-model="cardDraft"
            :maxlength="CUSTOM_CARD_CONTENT_MAX"
            :rows="12"
            placeholder="支持 Markdown 格式"
            class="w-full"
          />

          <div
            v-if="showPreview"
            class="max-h-60 overflow-y-auto rounded-xl border border-line bg-sunken p-3"
          >
            <Markdown
              v-if="cardDraft.trim()"
              :text="cardDraft"
              :class="markdownStyle === 'prose' ? 'prose dark:prose-invert' : undefined"
            />
            <p v-else class="text-xs text-fg-subtle">暂无内容</p>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full items-center gap-2">
          <UButton
            v-if="editingCardId"
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            @click="deleteCard"
          >
            删除
          </UButton>
          <div class="ml-auto flex items-center gap-2">
            <UButton color="neutral" variant="soft" @click="cardOpen = false">取消</UButton>
            <UButton icon="i-lucide-save" @click="saveCard">保存</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
