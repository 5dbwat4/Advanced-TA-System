<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'

import IconAction from '@/components/ui/IconAction.vue'
import Markdown from '@/components/ui/Markdown.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import { listQuestions, type Question } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { UButton, UCheckbox, UIcon, UModal, USkeleton } from '@/ui'

const PAGE_SIZE = 20

const props = withDefaults(
  defineProps<{
    selected: string[]
    initialQuestions?: Question[]
    dirty?: boolean
    disabled?: boolean
    open?: boolean
    title?: string
  }>(),
  {
    initialQuestions: () => [],
    dirty: false,
    disabled: false,
    open: false,
    title: '选择题目',
  },
)

const emit = defineEmits<{
  'update:selected': [ids: string[]]
  'update:open': [value: boolean]
  change: [payload: { ids: string[]; questions: Question[] }]
}>()

const localOpen = ref(props.open)
watch(
  () => props.open,
  (value) => {
    localOpen.value = value
  },
)

const modalOpen = computed({
  get: () => localOpen.value,
  set: (value: boolean) => {
    localOpen.value = value
    emit('update:open', value)
  },
})

const known = ref<Record<string, Question>>({})

function register(items: Question[]) {
  if (items.length === 0) return
  const next = { ...known.value }
  let changed = false
  for (const item of items) {
    if (next[item.id] !== item) {
      next[item.id] = item
      changed = true
    }
  }
  if (changed) known.value = next
}

watch(
  () => props.initialQuestions,
  (items) => {
    if (items && items.length > 0) register(items)
  },
  { immediate: true },
)

function setSelected(ids: string[]) {
  emit('update:selected', ids)
  emit('change', {
    ids,
    questions: ids
      .map((id) => known.value[id])
      .filter((item): item is Question => Boolean(item)),
  })
}

const keyword = ref('')
const debouncedKeyword = ref('')
let debounceTimer: number | undefined

watch(keyword, (value) => {
  window.clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => {
    debouncedKeyword.value = value
  }, 300)
})

const results = ref<Question[]>([])
const total = ref(0)
const loading = ref(true)
const loadingMore = ref(false)
const error = ref<string | null>(null)
const retryNonce = ref(0)

const query = computed(() => debouncedKeyword.value.trim())
let searchSeq = 0

async function search() {
  const seq = ++searchSeq
  loading.value = true
  error.value = null
  try {
    const data = await listQuestions({ q: query.value, limit: PAGE_SIZE, offset: 0 })
    if (seq !== searchSeq) return
    results.value = data.questions
    total.value = data.total
    register(data.questions)
  } catch (err) {
    if (seq === searchSeq) error.value = getErrorMessage(err, '加载失败')
  } finally {
    if (seq === searchSeq) loading.value = false
  }
}

watch([query, retryNonce], () => void search(), { immediate: true })

async function loadMore() {
  const seq = searchSeq
  loadingMore.value = true
  try {
    const data = await listQuestions({
      q: query.value,
      limit: PAGE_SIZE,
      offset: results.value.length,
    })
    if (seq !== searchSeq) return
    results.value = [...results.value, ...data.questions]
    total.value = data.total
    register(data.questions)
  } catch (err) {
    if (seq === searchSeq) toast.error(getErrorMessage(err, '加载失败'))
  } finally {
    if (seq === searchSeq) loadingMore.value = false
  }
}

function toggle(item: Question) {
  register([item])
  const next = props.selected.includes(item.id)
    ? props.selected.filter((id) => id !== item.id)
    : [...props.selected, item.id]
  setSelected(next)
}

function removeById(id: string) {
  const item = known.value[id]
  if (item) {
    toggle(item)
    return
  }
  setSelected(props.selected.filter((value) => value !== id))
}

function clearAll() {
  setSelected([])
}

function selectAllLoaded() {
  const added = results.value.filter((item) => !props.selected.includes(item.id))
  if (added.length === 0) return
  register(added)
  setSelected([...props.selected, ...added.map((item) => item.id)])
}

const selectedSet = computed(() => new Set(props.selected))
const allLoadedSelected = computed(
  () => results.value.length > 0 && results.value.every((item) => selectedSet.value.has(item.id)),
)

const selectedRows = computed(() =>
  props.selected.map((id, index) => ({ id, index, item: known.value[id] })),
)

onUnmounted(() => {
  window.clearTimeout(debounceTimer)
  searchSeq += 1
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2 text-xs font-semibold text-fg-muted">
        <UIcon name="i-lucide-list-checks" class="h-3.5 w-3.5 shrink-0" />
        已选 {{ props.selected.length }} 题
        <span v-if="props.dirty" class="text-amber-600 dark:text-amber-400">· 未保存</span>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          v-if="props.selected.length > 0"
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="props.disabled"
          @click="clearAll"
        >
          清空
        </UButton>
        <UButton
          size="sm"
          color="primary"
          :disabled="props.disabled"
          @click="modalOpen = true"
        >
          <UIcon name="i-lucide-list-checks" class="h-4 w-4 shrink-0" />
          选择题目
        </UButton>
      </div>
    </div>

    <div class="rounded-xl border border-line bg-sunken p-3">
      <p v-if="props.selected.length === 0" class="text-xs text-fg-subtle">
        还没有题目，点击「选择题目」搜索并勾选。
      </p>
      <div v-else class="flex max-h-44 flex-col gap-1 overflow-auto">
        <div
          v-for="row in selectedRows"
          :key="row.id"
          class="flex items-center gap-2 rounded-lg border border-line bg-elevated px-2.5 py-1.5"
        >
          <span class="tabular w-5 shrink-0 text-right text-[11px] text-fg-subtle">
            {{ row.index + 1 }}
          </span>
          <div v-if="row.item" class="min-w-0 flex-1 overflow-hidden text-xs">
            <Markdown :text="row.item.question" />
          </div>
          <span v-else class="min-w-0 flex-1 truncate text-xs text-fg-subtle">加载中…</span>
          <IconAction label="移出" :disabled="props.disabled" @click="removeById(row.id)">
            <UIcon name="i-lucide-x" class="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
          </IconAction>
        </div>
      </div>
    </div>

    <UModal v-model:open="modalOpen" :title="props.title" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <div class="flex flex-col gap-3">
          <SearchInput
            v-model="keyword"
            placeholder="搜索题目内容…"
            aria-label="搜索题目内容"
            :loading="loading"
          />

          <div class="flex items-center justify-between text-[11px] text-fg-subtle">
            <span class="tabular">匹配 {{ total }} 题</span>
            <button
              v-if="results.length > 0"
              type="button"
              :disabled="props.disabled || allLoadedSelected"
              class="font-medium text-brand-600 transition-colors hover:underline disabled:opacity-50 dark:text-brand-300"
              @click="selectAllLoaded"
            >
              {{ allLoadedSelected ? '本页已全选' : '全选本页' }}
            </button>
          </div>

          <div class="flex max-h-80 flex-col gap-1 overflow-auto">
            <div
              v-if="error"
              class="flex flex-col items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3 py-3"
            >
              <p class="text-xs text-danger">{{ error }}</p>
              <UButton size="sm" color="neutral" variant="soft" @click="retryNonce += 1">
                <UIcon name="i-lucide-rotate-ccw" class="h-3.5 w-3.5 shrink-0" />
                重试
              </UButton>
            </div>
            <div v-else-if="results.length === 0">
              <div v-if="loading" class="flex flex-col gap-1" aria-hidden="true">
                <USkeleton v-for="index in 4" :key="index" class="h-9 rounded-xl" />
              </div>
              <p v-else class="px-2 py-3 text-xs text-fg-subtle">
                {{ query ? '没有匹配的题目' : '题库暂无题目' }}
              </p>
            </div>
            <template v-else>
              <div
                v-for="item in results"
                :key="item.id"
                :class="
                  cn(
                    'flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 transition-colors',
                    props.disabled && 'cursor-not-allowed opacity-60',
                    selectedSet.has(item.id)
                      ? 'border-brand-500/50 bg-brand-500/10'
                      : 'border-line bg-elevated hover:border-brand-500/40',
                  )
                "
                @click="!props.disabled && toggle(item)"
              >
                <div class="mt-0.5 shrink-0" @click.stop>
                  <UCheckbox
                    :model-value="selectedSet.has(item.id)"
                    :disabled="props.disabled"
                    aria-label="选择题目"
                    @update:model-value="toggle(item)"
                  />
                </div>
                <div
                  :class="
                    cn(
                      'min-w-0 flex-1 text-xs',
                      selectedSet.has(item.id) ? 'text-fg' : 'text-fg-muted',
                    )
                  "
                >
                  <Markdown :text="item.question" />
                </div>
              </div>
            </template>
          </div>

          <UButton
            v-if="!loading && !error && results.length < total"
            size="sm"
            color="neutral"
            variant="ghost"
            :loading="loadingMore"
            :disabled="props.disabled"
            @click="loadMore"
          >
            <UIcon name="i-lucide-chevron-down" class="h-3.5 w-3.5 shrink-0" />
            加载更多（{{ results.length }}/{{ total }}）
          </UButton>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full items-center gap-2">
          <span class="text-xs text-fg-subtle">已选 {{ props.selected.length }} 题</span>
          <UButton
            v-if="props.selected.length > 0"
            color="neutral"
            variant="ghost"
            :disabled="props.disabled"
            @click="clearAll"
          >
            清空
          </UButton>
          <UButton class="ml-auto" color="primary" @click="modalOpen = false">完成</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
