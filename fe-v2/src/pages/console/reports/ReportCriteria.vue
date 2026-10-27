<script setup lang="ts">
import copyToClipboard from 'copy-to-clipboard'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import CriteriaEditor from '@/components/criteria/CriteriaEditor.vue'
import ImpactPreview from '@/components/criteria/ImpactPreview.vue'
import { computeCriteriaImpact, type CriteriaImpactResult } from '@/components/criteria/impact'
import { deserializeItems, serializeItems } from '@/components/criteria/serialize'
import type { CriterionItem } from '@/components/criteria/types'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import Spinner from '@/components/ui/Spinner.vue'
import {
  fetchCriteria,
  fetchCriteriaImpact,
  saveCriteria,
  updateCriteria,
} from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { UBadge, UButton, UIcon, UInput, UModal } from '@/ui'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const id = computed(() => {
  const value = route.params.id
  return typeof value === 'string' && value !== '' ? value : undefined
})

const key = computed(() => {
  const value = route.params.key
  return typeof value === 'string' && value !== '' ? value : undefined
})

const editing = computed(() => Boolean(key.value))
const canEdit = computed(() => auth.user != null)

const items = ref<CriterionItem[]>([])
const shareKey = ref<string | null>(key.value ?? null)
const usageCount = ref(0)
const saving = ref(false)
const loading = ref(false)
const importOpen = ref(false)
const overwriteOpen = ref(false)
const impactOpen = ref(false)
const importCode = ref('')
const importing = ref(false)
const impact = ref<CriteriaImpactResult | null>(null)
const impactOldItems = ref<CriterionItem[]>([])
const impactSelected = ref<string | null>(null)
const impactLoading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const SHARE_CODE_PATTERN = /^[0-9a-f]{48}$/i

function impactKey(item: { userId: string; experimentId: string }): string {
  return `${item.userId}-${item.experimentId}`
}

watch(
  key,
  async (value) => {
    if (!value) return
    loading.value = true
    try {
      const res = await fetchCriteria(value)
      if (!res.payload || !Array.isArray(res.payload.items)) {
        toast.error('评分标准内容无效')
        return
      }
      items.value = res.payload.items
      usageCount.value = res.usageCount ?? 0
    } catch (error) {
      toast.error(getErrorMessage(error, '加载失败'))
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

async function persist(): Promise<string | null> {
  saving.value = true
  try {
    if (key.value) {
      const res = await updateCriteria(key.value, { version: 1, items: items.value })
      shareKey.value = res.key
      toast.success('已保存评分标准')
      return res.key
    }
    const res = await saveCriteria({ version: 1, items: items.value })
    shareKey.value = res.key
    toast.success('已保存评分标准')
    return res.key
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
    return null
  } finally {
    saving.value = false
  }
}

async function share() {
  const code = shareKey.value ?? (await persist())
  if (!code) return
  if (await copyToClipboard(code)) toast.success('分享码已复制')
  else toast.error('复制失败，请手动复制')
}

function requestSave() {
  if (editing.value && usageCount.value > 0) {
    overwriteOpen.value = true
    return
  }
  void persist()
}

function confirmOverwrite() {
  void persist().finally(() => {
    overwriteOpen.value = false
  })
}

async function openImpact() {
  if (!key.value) return
  impact.value = null
  impactLoading.value = true
  impactOpen.value = true
  try {
    const res = await fetchCriteriaImpact(key.value, { version: 1, items: items.value })
    const result = computeCriteriaImpact(res.oldItems, items.value, res.reviews)
    impactOldItems.value = res.oldItems
    impact.value = result
    impactSelected.value = result.items[0] ? impactKey(result.items[0]) : null
  } catch (error) {
    toast.error(getErrorMessage(error, '加载失败'))
    impactOpen.value = false
  } finally {
    impactLoading.value = false
  }
}

async function saveAsCopy() {
  saving.value = true
  try {
    const res = await saveCriteria({ version: 1, items: items.value })
    toast.success('已另存为副本')
    void router.push(`/console/criteria/${res.key}/edit`)
  } catch (error) {
    toast.error(getErrorMessage(error, '另存失败'))
  } finally {
    saving.value = false
  }
}

async function doImport() {
  const code = importCode.value.trim().toLowerCase()
  if (!SHARE_CODE_PATTERN.test(code)) {
    toast.error('分享码格式不正确')
    return
  }
  importing.value = true
  try {
    const res = await fetchCriteria(code)
    if (!res.payload || !Array.isArray(res.payload.items)) {
      toast.error('评分标准内容无效')
      return
    }
    items.value = res.payload.items
    shareKey.value = code
    importOpen.value = false
    importCode.value = ''
    toast.success('已导入评分标准')
  } catch (error) {
    toast.error(getErrorMessage(error, '导入失败'))
  } finally {
    importing.value = false
  }
}

function pickJson() {
  fileInput.value?.click()
}

async function importJson(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const parsed: unknown = JSON.parse(text)
    const rawItems =
      Array.isArray(parsed) ? parsed : (parsed as { items?: unknown } | null)?.items
    if (!Array.isArray(rawItems)) {
      toast.error('评分标准内容无效')
      return
    }
    items.value = deserializeItems(rawItems)
    importOpen.value = false
    toast.success('已导入评分标准')
  } catch (error) {
    toast.error(getErrorMessage(error, '导入失败'))
  } finally {
    input.value = ''
  }
}

function exportJson() {
  const payload = { version: 1, items: serializeItems(items.value) }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `criteria-${shareKey.value ? shareKey.value.slice(0, 8) : 'new'}.json`
  link.click()
  URL.revokeObjectURL(url)
  toast.success('已导出 JSON')
}

function openImpactFromOverwrite() {
  overwriteOpen.value = false
  void openImpact()
}

const backTo = computed(() =>
  editing.value ? '/console/criteria' : id.value ? `/console/reports/${id.value}` : '/console/reports',
)

const selectedImpact = computed(
  () =>
    impact.value?.items.find((item) => impactKey(item) === impactSelected.value) ??
    impact.value?.items[0] ??
    null,
)
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden">
    <header
      class="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-elevated/60 px-4 backdrop-blur-xl"
    >
      <RouterLink
        :to="backTo"
        class="inline-flex items-center gap-1 text-xs font-semibold text-fg-subtle transition-colors hover:text-fg"
      >
        <UIcon name="i-lucide-arrow-left" class="h-3.5 w-3.5 shrink-0" />
        返回
      </RouterLink>
      <div class="h-5 w-px bg-line" />
      <div class="min-w-0 flex-1 truncate text-sm font-bold">
        {{ editing ? '编辑评分标准' : '创建评分标准' }}
      </div>
      <UBadge
        v-if="editing"
        :color="usageCount > 0 ? 'warning' : 'neutral'"
        variant="subtle"
        size="sm"
        class="shrink-0 font-semibold"
      >
        {{ usageCount > 0 ? `使用中 ${usageCount} 处` : '未被使用' }}
      </UBadge>
      <div class="flex shrink-0 items-center gap-2">
        <UButton
          v-if="editing && usageCount > 0"
          size="sm"
          color="neutral"
          variant="soft"
          icon="i-lucide-list-checks"
          :disabled="saving || loading"
          @click="openImpact"
        >
          查看受影响评分
        </UButton>
        <UButton
          size="sm"
          color="neutral"
          variant="soft"
          icon="i-lucide-file-down"
          :disabled="!canEdit"
          @click="importOpen = true"
        >
          导入
        </UButton>
        <UButton
          v-if="editing"
          size="sm"
          color="neutral"
          variant="soft"
          icon="i-lucide-copy"
          :disabled="saving || loading"
          @click="saveAsCopy"
        >
          另存为
        </UButton>
        <UButton
          size="sm"
          color="neutral"
          variant="soft"
          icon="i-lucide-file-up"
          @click="exportJson"
        >
          导出 JSON
        </UButton>
        <UButton
          size="sm"
          color="neutral"
          variant="soft"
          icon="i-lucide-share-2"
          @click="share"
        >
          分享
        </UButton>
        <PendingButton
          size="sm"
          :loading="saving"
          loading-label="保存中…"
          :disabled="loading || !canEdit"
          icon="i-lucide-save"
          @click="requestSave"
        >
          保存
        </PendingButton>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-auto">
      <div class="mx-auto w-full max-w-3xl p-4">
        <CriteriaEditor v-model:items="items" />
      </div>
    </div>

    <UModal v-model:open="importOpen" title="导入评分标准" :ui="{ content: 'sm:max-w-md' }">
      <template #body>
        <div class="flex flex-col gap-3">
          <UInput
            v-model="importCode"
            placeholder="输入 48 位分享码"
            aria-label="评分标准分享码"
          />
          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="soft"
              icon="i-lucide-file-up"
              @click="pickJson"
            >
              选择 JSON 文件
            </UButton>
            <input
              ref="fileInput"
              type="file"
              accept="application/json,.json"
              class="hidden"
              @change="importJson"
            />
          </div>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="soft" @click="importOpen = false">取消</UButton>
        <PendingButton
          :loading="importing"
          icon="i-lucide-file-down"
          :disabled="importCode.trim() === ''"
          @click="doImport"
        >
          导入
        </PendingButton>
      </template>
    </UModal>

    <UModal
      v-model:open="impactOpen"
      title="受影响的评分"
      :ui="{ content: 'sm:max-w-5xl' }"
    >
      <template #body>
        <div class="flex h-[68vh] flex-col gap-3 overflow-hidden">
          <div v-if="impactLoading" class="flex flex-1 items-center justify-center py-10">
            <Spinner size="lg" />
          </div>
          <p
            v-else-if="!impact || impact.items.length === 0"
            class="py-8 text-center text-sm text-fg-subtle"
          >
            没有评分会受到影响。
          </p>
          <template v-else>
            <p class="shrink-0 text-xs text-fg-subtle">
              共 {{ impact.total }} 份批阅，其中 {{ impact.items.length }} 份会受影响。
            </p>
            <div class="flex min-h-0 flex-1 gap-4">
              <div
                class="flex w-56 shrink-0 flex-col gap-1 overflow-auto border-r border-line pe-3"
              >
                <button
                  v-for="item in impact.items"
                  :key="impactKey(item)"
                  type="button"
                  :class="
                    cn(
                      'flex items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors',
                      selectedImpact && impactKey(selectedImpact) === impactKey(item)
                        ? 'bg-brand-500/10 text-fg'
                        : 'text-fg-muted hover:bg-sunken',
                    )
                  "
                  @click="impactSelected = impactKey(item)"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium">{{ item.name }}</span>
                    <span class="tabular block text-[11px] text-fg-subtle">
                      {{ item.studentId }} · {{ item.experimentMark }}
                    </span>
                  </span>
                  <UBadge
                    v-if="item.changes.filter((change) => change.kind !== 'section').length > 0"
                    color="warning"
                    variant="subtle"
                    size="xs"
                    class="tabular shrink-0 font-semibold"
                  >
                    {{ item.changes.filter((change) => change.kind !== 'section').length }}
                  </UBadge>
                </button>
              </div>
              <div class="min-w-0 flex-1 overflow-auto">
                <ImpactPreview
                  v-if="selectedImpact"
                  :item="selectedImpact"
                  :old-items="impactOldItems"
                />
              </div>
            </div>
          </template>
        </div>
      </template>
    </UModal>

    <ConfirmDialog
      v-model:open="overwriteOpen"
      title="评分标准正在被使用"
      confirm-text="继续保存"
      :loading="saving"
      :danger="false"
      icon="i-lucide-triangle-alert"
      @confirm="confirmOverwrite"
    >
      <div class="space-y-2 text-sm text-fg-muted">
        <p>
          你正在修改一个已被 <strong>{{ usageCount }}</strong> 次使用的评分标准。如果继续保存，对已被批阅的评分：
        </p>
        <ul class="list-disc space-y-1 ps-4">
          <li>
            <strong>分数不会自动重算</strong>（已保存分数保持不变），但已批阅明细会按新的规则文本/分值显示；
          </li>
          <li>新增卡片（含<strong>默认勾选</strong>的卡片）<strong>不会被勾选</strong>；</li>
          <li>被删除的卡片，其此前的勾选与附注将不再显示；</li>
        </ul>
        <p>
          若该分享码被多人共用，修改会同时影响所有使用它的人。你确定要继续吗？
        </p>
      </div>
      <template #actions>
        <UButton
          class="me-auto"
          color="neutral"
          variant="soft"
          icon="i-lucide-list-checks"
          @click="openImpactFromOverwrite"
        >
          查看受影响评分
        </UButton>
      </template>
    </ConfirmDialog>
  </div>
</template>
