<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import copyToClipboard from 'copy-to-clipboard'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import BackLink from '@/components/ui/BackLink.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import IconAction from '@/components/ui/IconAction.vue'
import Markdown from '@/components/ui/Markdown.vue'
import MarkdownEditor from '@/components/ui/MarkdownEditor.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import {
  addBankQuestions,
  deleteBank,
  duplicateBank,
  fetchBankQuestions,
  listBanks,
  removeBankQuestions,
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
import {
  UButton,
  UCheckbox,
  UDropdownMenu,
  UIcon,
  UInput,
  UModal,
  USelect,
  USkeleton,
  UTabs,
} from '@/ui'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const id = computed(() => String(route.params.id ?? ''))

const { data, error, loading, reload } = useAsyncData(async () => {
  if (!id.value) {
    return { bank: null as QuestionBank | null, questions: [] as Question[], banks: [] as QuestionBank[] }
  }
  const [bankRes, questionRes] = await Promise.all([listBanks(), fetchBankQuestions(id.value)])
  return {
    bank: bankRes.banks.find((item) => item.id === id.value) ?? null,
    questions: questionRes.questions,
    banks: bankRes.banks,
  }
}, [id])

watch(error, (value) => {
  if (value) toast.error(value)
})

const bank = computed(() => data.value?.bank ?? null)
const questions = computed(() => data.value?.questions ?? [])
const banks = computed(() => data.value?.banks ?? [])
const isOwner = computed(() => bank.value != null && bank.value.owner.id === auth.user?.id)

async function copyText(text: string, label: string) {
  const ok = await copyToClipboard(text)
  if (ok) toast.success(`已复制${label}`)
  else toast.error('复制失败')
}

const renaming = ref(false)
const renameValue = ref('')
const busy = ref(false)
const pendingRename = ref<string | null>(null)
const renameOpen = ref(false)
const confirmOpen = ref(false)
const expanded = ref<Record<string, boolean>>({})
const removingId = ref<string | null>(null)

watch(renameOpen, (open) => {
  if (!open) pendingRename.value = null
})

function toggleExpanded(questionId: string) {
  expanded.value = { ...expanded.value, [questionId]: !expanded.value[questionId] }
}

async function performRename(next: string) {
  if (!bank.value) return
  try {
    await renameBank(bank.value.id, next)
    toast.success('已重命名')
    renaming.value = false
    pendingRename.value = null
    renameOpen.value = false
    await reload()
  } catch (err) {
    toast.error(getErrorMessage(err, '重命名失败'))
  }
}

async function submitRename() {
  if (!bank.value || pendingRename.value) return
  const next = renameValue.value.trim()
  if (!next || next === bank.value.name) {
    renaming.value = false
    return
  }
  if (!isOwner.value) {
    pendingRename.value = next
    renameOpen.value = true
    return
  }
  await performRename(next)
}

async function confirmRename() {
  const pending = pendingRename.value
  if (!pending) return
  renameOpen.value = false
  await performRename(pending)
}

async function exportMarkdown() {
  if (!bank.value) return
  try {
    const res = await fetchBankQuestions(bank.value.id)
    downloadMarkdown(bankFilename(bank.value.name), bankQuestionsToMarkdown(bank.value.name, res.questions))
    toast.success('已导出为 Markdown')
  } catch (err) {
    toast.error(getErrorMessage(err, '导出失败'))
  }
}

async function duplicateBankAction() {
  if (!bank.value) return
  busy.value = true
  try {
    const { bank: copy } = await duplicateBank(bank.value.id)
    toast.success('已复制题目集')
    await router.push(`/console/questions/banks/${copy.id}`)
  } catch (err) {
    toast.error(getErrorMessage(err, '复制失败'))
  } finally {
    busy.value = false
  }
}

async function removeBank() {
  if (!bank.value) return
  busy.value = true
  try {
    await deleteBank(bank.value.id)
    toast.success('已删除题目集')
    confirmOpen.value = false
    await router.push('/console/questions?tab=sets')
  } catch (err) {
    toast.error(getErrorMessage(err, '删除失败'))
  } finally {
    busy.value = false
  }
}

async function removeQuestion(questionId: string) {
  if (!bank.value) return
  removingId.value = questionId
  try {
    await removeBankQuestions(bank.value.id, [questionId])
    toast.success('已从题目集中移除')
    await reload()
  } catch (err) {
    toast.error(getErrorMessage(err, '移除失败'))
  } finally {
    removingId.value = null
  }
}

const editOpen = ref(false)
const editTarget = ref<Question | null>(null)
const editQuestion = ref('')
const editAnswer = ref('')
const editPreview = ref(false)
const editSaving = ref(false)

function openEdit(item: Question) {
  editTarget.value = item
  editQuestion.value = item.question
  editAnswer.value = item.answer
  editPreview.value = false
  editOpen.value = true
}

async function submitEdit() {
  if (!editTarget.value) return
  editSaving.value = true
  try {
    await updateQuestion(editTarget.value.id, {
      question: editQuestion.value.trim(),
      answer: editAnswer.value.trim(),
    })
    toast.success('已保存修改')
    editOpen.value = false
    await reload()
  } catch (err) {
    toast.error(getErrorMessage(err, '保存失败'))
  } finally {
    editSaving.value = false
  }
}

const moveOpen = ref(false)
const moveMode = ref('copy')
const moveTargetId = ref('')
const moveSelected = ref<string[]>([])
const moving = ref(false)

const moveModeItems = [
  { label: '复制', value: 'copy' },
  { label: '移动', value: 'move' },
]

const targetBanks = computed(() => banks.value.filter((item) => item.id !== bank.value?.id))
const bankOptions = computed(() =>
  targetBanks.value.map((item) => ({ label: item.name, value: item.id })),
)

function openMove() {
  moveMode.value = 'copy'
  moveTargetId.value = ''
  moveSelected.value = []
  moveOpen.value = true
}

function toggleMove(questionId: string) {
  moveSelected.value = moveSelected.value.includes(questionId)
    ? moveSelected.value.filter((value) => value !== questionId)
    : [...moveSelected.value, questionId]
}

function selectAllForMove() {
  moveSelected.value = questions.value.map((item) => item.id)
}

async function submitMove() {
  if (!bank.value || !moveTargetId.value || moveSelected.value.length === 0) return
  moving.value = true
  try {
    await addBankQuestions(moveTargetId.value, moveSelected.value)
    if (moveMode.value === 'move') {
      await removeBankQuestions(bank.value.id, moveSelected.value)
    }
    toast.success(moveMode.value === 'move' ? '已移动题目' : '已复制题目')
    moveOpen.value = false
    await reload()
  } catch (err) {
    toast.error(getErrorMessage(err, moveMode.value === 'move' ? '移动失败' : '复制失败'))
  } finally {
    moving.value = false
  }
}

const detailMenuItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: '重命名',
      icon: 'i-lucide-pen',
      onSelect: () => {
        if (!bank.value) return
        renameValue.value = bank.value.name
        renaming.value = true
      },
    },
    {
      label: '导出为 Markdown',
      icon: 'i-lucide-file-down',
      onSelect: () => {
        void exportMarkdown()
      },
    },
    {
      label: '复制',
      icon: 'i-lucide-copy',
      onSelect: () => {
        void duplicateBankAction()
      },
    },
    {
      label: '删除',
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: () => {
        confirmOpen.value = true
      },
    },
  ],
])

function goManage() {
  if (bank.value) void router.push(`/console/questions/banks/${bank.value.id}/manage`)
}
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <BackLink to="/console/questions?tab=sets">返回题库</BackLink>

    <div v-if="loading" class="space-y-3">
      <USkeleton class="h-16 rounded-2xl" />
      <USkeleton class="h-24 rounded-2xl" />
    </div>
    <EmptyState
      v-else-if="!bank"
      icon="i-lucide-notebook-text"
      title="题目集不存在"
      hint="它可能已被删除"
    />
    <template v-else>
      <PageHeader :title="bank.name">
        <template #actions>
          <UButton size="sm" color="primary" @click="goManage">
            <UIcon name="i-lucide-settings-2" class="h-3.5 w-3.5 shrink-0" />
            管理题目
          </UButton>
          <UDropdownMenu :items="detailMenuItems">
            <UButton size="sm" square color="neutral" variant="soft" aria-label="更多操作">
              <UIcon name="i-lucide-ellipsis" class="h-4 w-4 shrink-0" />
            </UButton>
          </UDropdownMenu>
        </template>
      </PageHeader>

      <div class="mb-4 flex flex-wrap items-center gap-2">
        <template v-if="renaming">
          <UInput
            v-model="renameValue"
            class="max-w-xs"
            maxlength="64"
            autofocus
            aria-label="重命名题目集"
            @keydown.enter.prevent="submitRename"
            @keydown.esc="renaming = false"
            @blur="submitRename"
          />
        </template>
        <template v-else>
          <span class="rounded-lg border border-line bg-sunken px-2 py-0.5 text-[11px] text-fg-muted">
            {{ bank.owner.username ?? bank.owner.name }}
            <span v-if="isOwner" class="ml-1 text-brand-600 dark:text-brand-300">（我）</span>
          </span>
          <span
            class="tabular rounded-lg bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300"
          >
            {{ questions.length }} 题
          </span>
          <span
            class="tabular rounded-lg border border-line bg-sunken px-2 py-0.5 text-[11px] text-fg-muted"
          >
            {{ bank.experimentCount }} 个实验使用
          </span>
        </template>
      </div>

      <p v-if="!isOwner" class="mb-4 text-[11px] text-amber-600 dark:text-amber-400">
        非管理者编辑会影响所有使用该题目集的实验
      </p>

      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div class="text-xs font-semibold text-fg-muted">题目（{{ questions.length }}）</div>
        <UButton
          v-if="questions.length > 0"
          size="xs"
          color="neutral"
          variant="ghost"
          @click="openMove"
        >
          <UIcon name="i-lucide-copy" class="h-3.5 w-3.5 shrink-0" />
          移动 / 复制
        </UButton>
      </div>

      <EmptyState
        v-if="questions.length === 0"
        icon="i-lucide-notebook-text"
        title="题目集为空"
        hint="点击「管理题目」添加题目"
      />
      <div v-else class="space-y-3">
        <div
          v-for="(item, index) in questions"
          :key="item.id"
          class="rounded-2xl border border-line bg-elevated p-5"
        >
          <div class="flex items-center gap-2 text-[11px] text-fg-subtle">
            <span class="tabular">#{{ index + 1 }}</span>
            <span>{{ item.user.username ?? item.user.name }}</span>
          </div>

          <div class="mt-3">
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
            <IconAction label="编辑" @click="openEdit(item)">
              <UIcon name="i-lucide-pen" class="h-3.5 w-3.5 shrink-0" />
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
            <span class="ml-auto">
              <UButton
                size="sm"
                square
                color="error"
                variant="soft"
                aria-label="从题目集中移除"
                :loading="removingId === item.id"
                @click="removeQuestion(item.id)"
              >
                <UIcon name="i-lucide-x" class="h-3.5 w-3.5 shrink-0" />
              </UButton>
            </span>
          </div>

          <div v-if="expanded[item.id]" class="mt-2 overflow-hidden">
            <div class="rounded-xl bg-sunken p-4">
              <Markdown :text="item.answer" />
            </div>
          </div>
        </div>
      </div>
    </template>

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

    <UModal
      v-model:open="editOpen"
      title="编辑题目"
      :ui="{ content: 'sm:max-w-2xl' }"
    >
      <template #body>
        <div class="flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-fg-muted">Markdown</span>
            <UCheckbox v-model="editPreview" label="预览" />
          </div>

          <template v-if="!editPreview">
            <div>
              <label class="mb-1.5 block text-xs font-semibold text-fg-muted">题目</label>
              <MarkdownEditor v-model="editQuestion" :height="180" />
            </div>
            <div>
              <label class="mb-1.5 block text-xs font-semibold text-fg-muted">答案</label>
              <MarkdownEditor v-model="editAnswer" :height="180" />
            </div>
          </template>

          <template v-else>
            <div>
              <div class="mb-1.5 text-xs font-semibold text-fg-muted">题目</div>
              <div class="rounded-xl bg-sunken p-4">
                <Markdown :text="editQuestion || '（空）'" />
              </div>
            </div>
            <div>
              <div class="mb-1.5 text-xs font-semibold text-fg-muted">答案</div>
              <div class="rounded-xl bg-sunken p-4">
                <Markdown :text="editAnswer || '（空）'" />
              </div>
            </div>
          </template>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="soft" @click="editOpen = false">取消</UButton>
        <PendingButton
          color="primary"
          :loading="editSaving"
          :disabled="!editQuestion.trim() || !editAnswer.trim()"
          icon="i-lucide-check"
          loading-label="保存中"
          @click="submitEdit"
        >
          保存修改
        </PendingButton>
      </template>
    </UModal>

    <UModal v-model:open="moveOpen" title="移动 / 复制题目" :ui="{ content: 'sm:max-w-lg' }">
      <template #body>
        <div class="flex flex-col gap-4">
          <UTabs
            :model-value="moveMode"
            :items="moveModeItems"
            variant="pill"
            :content="false"
            @update:model-value="(value: string | number) => (moveMode = value === 'move' ? 'move' : 'copy')"
          />

          <div>
            <label class="mb-1.5 block text-xs font-semibold text-fg-muted">目标题目集</label>
            <USelect
              v-model="moveTargetId"
              :items="bankOptions"
              placeholder="选择目标题目集"
              class="w-full"
            />
          </div>

          <div>
            <div class="mb-2 flex items-center justify-between text-xs text-fg-muted">
              <span>选择题目（{{ moveSelected.length }} / {{ questions.length }}）</span>
              <UButton size="xs" color="neutral" variant="ghost" @click="selectAllForMove">
                全选
              </UButton>
            </div>
            <div class="flex max-h-64 flex-col gap-1 overflow-auto rounded-xl border border-line p-2">
              <UCheckbox
                v-for="item in questions"
                :key="item.id"
                :model-value="moveSelected.includes(item.id)"
                @update:model-value="toggleMove(item.id)"
              >
                <template #label>
                  <span class="line-clamp-2 text-xs">{{ item.question }}</span>
                </template>
              </UCheckbox>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="soft" @click="moveOpen = false">取消</UButton>
        <PendingButton
          color="primary"
          :loading="moving"
          :disabled="!moveTargetId || moveSelected.length === 0"
          icon="i-lucide-check"
          @click="submitMove"
        >
          {{ moveMode === 'move' ? '移动题目' : '复制题目' }}
        </PendingButton>
      </template>
    </UModal>

    <ConfirmDialog
      :open="confirmOpen"
      title="删除题目集"
      :description="`确定删除「${bank?.name ?? ''}」吗？该操作不可撤销。`"
      :loading="busy"
      @update:open="confirmOpen = $event"
      @confirm="removeBank"
    />
  </div>
</template>
