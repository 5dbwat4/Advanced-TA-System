<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import copyToClipboard from 'copy-to-clipboard'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconAction from '@/components/ui/IconAction.vue'
import Markdown from '@/components/ui/Markdown.vue'
import MarkdownEditor from '@/components/ui/MarkdownEditor.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import {
  createQuestion,
  deleteBank,
  deleteQuestion,
  duplicateBank,
  duplicateQuestion,
  fetchBankQuestions,
  listBanks,
  listQuestions,
  renameBank,
  updateQuestion,
  type Question,
  type QuestionBank,
} from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { bankFilename, bankQuestionsToMarkdown, downloadMarkdown } from '@/lib/download'
import { getErrorMessage } from '@/lib/error'
import { useAsyncData } from '@/lib/request'
import { toast } from '@/lib/toast'
import { UButton, UCheckbox, UDropdownMenu, UIcon, UInput, UModal, UPagination, UTabs } from '@/ui'

const PAGE_SIZE = 20

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const tab = computed<string | number>({
  get: () => (route.query.tab === 'sets' ? 'sets' : 'questions'),
  set: (value) => {
    if (value === 'sets') void router.replace({ query: { tab: 'sets' } })
    else void router.replace({ query: {} })
  },
})

const tabItems = [
  { label: '题目', value: 'questions' },
  { label: '题目集', value: 'sets' },
]

async function copyText(text: string, label: string) {
  const ok = await copyToClipboard(text)
  if (ok) toast.success(`已复制${label}`)
  else toast.error('复制失败')
}

const items = ref<Question[]>([])
const total = ref(0)
const query = ref('')
const applied = ref('')
const loading = ref(true)
const page = ref(1)
const refreshKey = ref(0)
const formOpen = ref(false)
const editingId = ref<string | null>(null)
const question = ref('')
const answer = ref('')
const formPreview = ref(false)
const saving = ref(false)
const expanded = ref<Record<string, boolean>>({})
const confirmTarget = ref<Question | null>(null)
const confirmOpen = ref(false)
const busyId = ref<string | null>(null)

let debounceTimer: number | undefined
watch(query, (value) => {
  window.clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => {
    applied.value = value.trim()
    page.value = 1
  }, 300)
})

let loadSeq = 0

async function loadQuestions() {
  const seq = ++loadSeq
  loading.value = true
  try {
    const data = await listQuestions({
      q: applied.value,
      limit: PAGE_SIZE,
      offset: (page.value - 1) * PAGE_SIZE,
    })
    if (seq !== loadSeq) return
    const maxPage = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
    if (page.value > maxPage) {
      page.value = maxPage
      return
    }
    items.value = data.questions
    total.value = data.total
  } catch (error) {
    if (seq === loadSeq) toast.error(getErrorMessage(error, '加载失败'))
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch([applied, page, refreshKey], () => void loadQuestions(), { immediate: true })

watch(confirmOpen, (open) => {
  if (!open) confirmTarget.value = null
})

function refresh() {
  refreshKey.value += 1
}

function goToPage(next: number) {
  page.value = next
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function isOwner(item: Question) {
  return item.provider === auth.user?.id
}

function toggleExpanded(id: string) {
  expanded.value = { ...expanded.value, [id]: !expanded.value[id] }
}

function resetForm() {
  formOpen.value = false
  editingId.value = null
  question.value = ''
  answer.value = ''
  formPreview.value = false
}

function openCreate() {
  editingId.value = null
  question.value = ''
  answer.value = ''
  formPreview.value = false
  formOpen.value = true
}

function openEdit(item: Question) {
  editingId.value = item.id
  question.value = item.question
  answer.value = item.answer
  formPreview.value = false
  formOpen.value = true
}

async function submitForm() {
  saving.value = true
  try {
    const body = { question: question.value.trim(), answer: answer.value.trim() }
    if (editingId.value) {
      await updateQuestion(editingId.value, body)
      toast.success('已保存修改')
    } else {
      await createQuestion(body)
      toast.success('已添加题目')
    }
    resetForm()
    refresh()
  } catch (error) {
    toast.error(getErrorMessage(error, editingId.value ? '保存失败' : '创建失败'))
  } finally {
    saving.value = false
  }
}

async function duplicateQuestionAction(id: string) {
  busyId.value = id
  try {
    await duplicateQuestion(id)
    toast.success('已复制题目，你现在可以编辑副本')
    refresh()
  } catch (error) {
    toast.error(getErrorMessage(error, '复制失败'))
  } finally {
    busyId.value = null
  }
}

function openConfirm(item: Question) {
  confirmTarget.value = item
  confirmOpen.value = true
}

function onConfirmOpen(value: boolean) {
  confirmOpen.value = value
  if (!value) confirmTarget.value = null
}

async function removeQuestion(id: string) {
  busyId.value = id
  try {
    await deleteQuestion(id)
    toast.success('已删除题目')
    confirmOpen.value = false
    refresh()
  } catch (error) {
    toast.error(getErrorMessage(error, '删除失败'))
  } finally {
    busyId.value = null
  }
}

const confirmDescription = computed(
  () => `确定删除「${confirmTarget.value?.question ?? ''}」吗？此操作不可撤销。`,
)

const {
  data: banksData,
  error: banksError,
  loading: banksLoading,
  reload: reloadBanks,
} = useAsyncData(() => listBanks(), [])

const banks = computed(() => banksData.value?.banks ?? [])

watch(banksError, (value) => {
  if (value) toast.error(value)
})

const renamingId = ref<string | null>(null)
const renameValue = ref('')
const pendingRename = ref<{ bank: QuestionBank; next: string } | null>(null)
const renameOpen = ref(false)
const bankConfirmTarget = ref<QuestionBank | null>(null)
const bankConfirmOpen = ref(false)
const bankBusyId = ref<string | null>(null)

watch(renameOpen, (open) => {
  if (!open) pendingRename.value = null
})

watch(bankConfirmOpen, (open) => {
  if (!open) bankConfirmTarget.value = null
})

function isBankOwner(bank: QuestionBank) {
  return bank.owner.id === auth.user?.id
}

async function performRename(bank: QuestionBank, next: string) {
  try {
    await renameBank(bank.id, next)
    toast.success('已重命名')
    renamingId.value = null
    pendingRename.value = null
    await reloadBanks()
  } catch (error) {
    toast.error(getErrorMessage(error, '重命名失败'))
  }
}

async function submitRename(bank: QuestionBank) {
  if (pendingRename.value) return
  const next = renameValue.value.trim()
  if (!next || next === bank.name) {
    renamingId.value = null
    return
  }
  if (!isBankOwner(bank)) {
    pendingRename.value = { bank, next }
    renameOpen.value = true
    return
  }
  await performRename(bank, next)
}

async function confirmRename() {
  const pending = pendingRename.value
  if (!pending) return
  renameOpen.value = false
  await performRename(pending.bank, pending.next)
}

async function duplicateBankAction(id: string) {
  bankBusyId.value = id
  try {
    await duplicateBank(id)
    toast.success('已复制题目集')
    await reloadBanks()
  } catch (error) {
    toast.error(getErrorMessage(error, '复制失败'))
  } finally {
    bankBusyId.value = null
  }
}

async function exportMarkdown(bank: QuestionBank) {
  try {
    const { questions } = await fetchBankQuestions(bank.id)
    downloadMarkdown(bankFilename(bank.name), bankQuestionsToMarkdown(bank.name, questions))
    toast.success('已导出为 Markdown')
  } catch (error) {
    toast.error(getErrorMessage(error, '导出失败'))
  }
}

function openBankConfirm(bank: QuestionBank) {
  bankConfirmTarget.value = bank
  bankConfirmOpen.value = true
}

function onBankConfirmOpen(value: boolean) {
  bankConfirmOpen.value = value
  if (!value) bankConfirmTarget.value = null
}

async function removeBank(id: string) {
  bankBusyId.value = id
  try {
    await deleteBank(id)
    toast.success('已删除题目集')
    bankConfirmOpen.value = false
    await reloadBanks()
  } catch (error) {
    toast.error(getErrorMessage(error, '删除失败'))
  } finally {
    bankBusyId.value = null
  }
}

function bankMenuItems(bank: QuestionBank): DropdownMenuItem[][] {
  return [
    [
      {
        label: '重命名',
        icon: 'i-lucide-pen',
        onSelect: () => {
          renamingId.value = bank.id
          renameValue.value = bank.name
        },
      },
      {
        label: '导出为 Markdown',
        icon: 'i-lucide-file-down',
        onSelect: () => {
          void exportMarkdown(bank)
        },
      },
    ],
  ]
}

function goNewBank() {
  void router.push('/console/questions/banks/new')
}

function goBank(id: string) {
  void router.push(`/console/questions/banks/${id}`)
}

onUnmounted(() => {
  window.clearTimeout(debounceTimer)
  loadSeq += 1
})
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <PageHeader title="题库" />

    <UTabs v-model="tab" :items="tabItems" variant="pill" :ui="{ list: 'max-w-xs' }">
      <template #content="{ item }">
        <div class="pt-4">
          <div v-if="item.value === 'questions'">
            <div class="mb-4 flex flex-wrap items-center gap-3">
              <SearchInput
                v-model="query"
                placeholder="搜索题目内容…"
                aria-label="搜索题目内容"
                class="min-w-[16rem] flex-1"
              />
              <UButton color="primary" @click="openCreate">
                <UIcon name="i-lucide-plus" class="h-4 w-4 shrink-0" />
                新建题目
              </UButton>
            </div>

            <div v-if="!loading" class="mb-3 text-xs text-fg-subtle">
              共 {{ total }} 题<span v-if="applied">（匹配「{{ applied }}」）</span>
            </div>

            <SkeletonList v-if="loading" :rows="4" class="h-24 rounded-2xl" />
            <EmptyState
              v-else-if="items.length === 0"
              icon="i-lucide-notebook-text"
              :title="applied ? '没有匹配的题目' : '暂无题目'"
              :hint="applied ? '换个关键词试试' : '点击右上角新建题目'"
            />
            <div v-else class="space-y-3">
              <div
                v-for="item in items"
                :key="item.id"
                class="rounded-2xl border border-line bg-elevated p-5"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="rounded-lg border border-line bg-sunken px-2 py-0.5 text-[11px] text-fg-muted"
                  >
                    {{ item.user.username ?? item.user.name }}
                    <span v-if="isOwner(item)" class="ml-1 text-brand-600 dark:text-brand-300"
                      >（我）</span
                    >
                  </span>
                  <span class="tabular text-[11px] text-fg-subtle">
                    {{ new Date(item.createdAt).toLocaleDateString() }}
                  </span>
                  <div class="ml-auto flex items-center gap-1">
                    <IconAction v-if="isOwner(item)" label="编辑" @click="openEdit(item)">
                      <UIcon name="i-lucide-pen" class="h-3.5 w-3.5 shrink-0" />
                    </IconAction>
                    <UButton
                      v-else
                      size="sm"
                      variant="ghost"
                      :loading="busyId === item.id"
                      @click="duplicateQuestionAction(item.id)"
                    >
                      <UIcon name="i-lucide-copy" class="h-3.5 w-3.5 shrink-0" />
                      创建副本编辑
                    </UButton>
                    <IconAction v-if="isOwner(item)" label="删除" @click="openConfirm(item)">
                      <UIcon name="i-lucide-trash-2" class="h-3.5 w-3.5 shrink-0" />
                    </IconAction>
                  </div>
                </div>

                <div class="mt-4">
                  <Markdown :text="item.question" />
                </div>

                <div class="mt-3 flex flex-wrap items-center gap-1">
                  <IconAction
                    :label="expanded[item.id] ? '隐藏答案' : '显示答案'"
                    @click="toggleExpanded(item.id)"
                  >
                    <UIcon
                      :name="expanded[item.id] ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                      class="h-3.5 w-3.5 shrink-0"
                    />
                  </IconAction>
                  <IconAction label="复制题目" @click="copyText(item.question, '题目')">
                    <UIcon name="i-lucide-copy" class="h-3.5 w-3.5 shrink-0" />
                  </IconAction>
                  <IconAction
                    v-if="expanded[item.id]"
                    label="复制答案"
                    @click="copyText(item.answer, '答案')"
                  >
                    <UIcon name="i-lucide-copy" class="h-3.5 w-3.5 shrink-0" />
                  </IconAction>
                </div>

                <div v-if="expanded[item.id]" class="mt-2 overflow-hidden">
                  <div class="rounded-xl bg-sunken p-4">
                    <Markdown :text="item.answer" />
                  </div>
                </div>
              </div>
            </div>

            <UPagination
              v-if="!loading && total > PAGE_SIZE"
              :page="page"
              :total="total"
              :items-per-page="PAGE_SIZE"
              :sibling-count="1"
              show-edges
              size="sm"
              class="mt-4 flex justify-center"
              @update:page="goToPage"
            />
          </div>

          <div v-else>
            <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
              <span class="text-xs text-fg-subtle">共 {{ banks.length }} 个题目集</span>
              <UButton color="primary" @click="goNewBank">
                <UIcon name="i-lucide-plus" class="h-4 w-4 shrink-0" />
                新建题目集
              </UButton>
            </div>

            <SkeletonList v-if="banksLoading" :rows="3" class="h-24 rounded-2xl" />
            <EmptyState
              v-else-if="banks.length === 0"
              icon="i-lucide-library"
              title="暂无题目集"
              hint="点击右上角新建题目集"
            />
            <div v-else class="space-y-3">
              <div
                v-for="bank in banks"
                :key="bank.id"
                class="rounded-2xl border border-line bg-elevated p-5"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <UInput
                    v-if="renamingId === bank.id"
                    v-model="renameValue"
                    class="max-w-xs"
                    maxlength="64"
                    autofocus
                    aria-label="重命名题目集"
                    @keydown.enter.prevent="submitRename(bank)"
                    @keydown.esc="renamingId = null"
                    @blur="submitRename(bank)"
                  />
                  <h3 v-else class="min-w-0 truncate text-sm font-bold">{{ bank.name }}</h3>

                  <span
                    class="rounded-lg border border-line bg-sunken px-2 py-0.5 text-[11px] text-fg-muted"
                  >
                    {{ bank.owner.username ?? bank.owner.name }}
                    <span v-if="isBankOwner(bank)" class="ml-1 text-brand-600 dark:text-brand-300"
                      >（我）</span
                    >
                  </span>
                  <span
                    class="tabular rounded-lg bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300"
                  >
                    {{ bank.questions.length }} 题
                  </span>
                  <span
                    class="tabular rounded-lg border border-line bg-sunken px-2 py-0.5 text-[11px] text-fg-muted"
                  >
                    {{ bank.experimentCount }} 个实验使用
                  </span>

                  <div class="ml-auto flex items-center gap-1">
                    <UButton size="sm" color="neutral" variant="soft" @click="goBank(bank.id)">
                      <UIcon name="i-lucide-settings-2" class="h-3.5 w-3.5 shrink-0" />
                      管理题目
                    </UButton>
                    <IconAction
                      label="复制"
                      :loading="bankBusyId === bank.id"
                      @click="duplicateBankAction(bank.id)"
                    >
                      <UIcon name="i-lucide-copy" class="h-3.5 w-3.5 shrink-0" />
                    </IconAction>
                    <IconAction label="删除" @click="openBankConfirm(bank)">
                      <UIcon name="i-lucide-trash-2" class="h-3.5 w-3.5 shrink-0" />
                    </IconAction>
                    <UDropdownMenu :items="bankMenuItems(bank)">
                      <UButton
                        size="sm"
                        square
                        color="neutral"
                        variant="ghost"
                        aria-label="更多操作"
                      >
                        <UIcon name="i-lucide-ellipsis" class="h-4 w-4 shrink-0" />
                      </UButton>
                    </UDropdownMenu>
                  </div>
                </div>

                <p
                  v-if="!isBankOwner(bank)"
                  class="mt-3 text-[11px] text-amber-600 dark:text-amber-400"
                >
                  非管理者编辑会影响所有使用该题目集的实验
                </p>
              </div>
            </div>
          </div>
        </div>
      </template>
    </UTabs>

    <UModal
      v-model:open="formOpen"
      :title="editingId ? '编辑题目' : '新建题目'"
      :ui="{ content: 'sm:max-w-2xl' }"
    >
      <template #body>
        <div class="flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-fg-muted">Markdown</span>
            <UCheckbox v-model="formPreview" label="预览" />
          </div>

          <template v-if="!formPreview">
            <div>
              <label class="mb-1.5 block text-xs font-semibold text-fg-muted">题目</label>
              <MarkdownEditor v-model="question" :height="180" />
            </div>
            <div>
              <label class="mb-1.5 block text-xs font-semibold text-fg-muted">答案</label>
              <MarkdownEditor v-model="answer" :height="180" />
            </div>
          </template>

          <template v-else>
            <div>
              <div class="mb-1.5 text-xs font-semibold text-fg-muted">题目</div>
              <div class="rounded-xl bg-sunken p-4">
                <Markdown :text="question || '（空）'" />
              </div>
            </div>
            <div>
              <div class="mb-1.5 text-xs font-semibold text-fg-muted">答案</div>
              <div class="rounded-xl bg-sunken p-4">
                <Markdown :text="answer || '（空）'" />
              </div>
            </div>
          </template>
        </div>
      </template>

      <template #footer>
        <UButton color="neutral" variant="soft" @click="resetForm">取消</UButton>
        <PendingButton
          color="primary"
          :loading="saving"
          :disabled="!question.trim() || !answer.trim()"
          icon="i-lucide-check"
          loading-label="保存中"
          @click="submitForm"
        >
          {{ editingId ? '保存修改' : '添加题目' }}
        </PendingButton>
      </template>
    </UModal>

    <ConfirmDialog
      :open="confirmOpen"
      title="删除题目"
      :description="confirmDescription"
      :loading="busyId !== null && busyId === confirmTarget?.id"
      @update:open="onConfirmOpen"
      @confirm="confirmTarget && removeQuestion(confirmTarget.id)"
    />

    <UModal v-model:open="renameOpen" title="重命名题目集" :ui="{ content: 'sm:max-w-md' }">
      <template #body>
        <p class="text-sm text-fg-muted">
          你不是该题目集的管理者，修改会影响所有使用它的实验。确定继续吗？
        </p>
      </template>
      <template #footer>
        <UButton color="neutral" variant="soft" @click="renameOpen = false">取消</UButton>
        <UButton color="primary" @click="confirmRename">确定继续</UButton>
      </template>
    </UModal>

    <ConfirmDialog
      :open="bankConfirmOpen"
      title="删除题目集"
      :description="`确定删除「${bankConfirmTarget?.name ?? ''}」吗？该操作不可撤销。`"
      :loading="bankBusyId !== null && bankBusyId === bankConfirmTarget?.id"
      @update:open="onBankConfirmOpen"
      @confirm="bankConfirmTarget && removeBank(bankConfirmTarget.id)"
    />
  </div>
</template>
