<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import copyToClipboard from 'copy-to-clipboard'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import CriteriaPreview from '@/components/criteria/CriteriaPreview.vue'
import type { CriterionItem } from '@/components/criteria/types'
import Card from '@/components/ui/Card.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SkeletonList from '@/components/ui/SkeletonList.vue'
import {
  deleteCriteria,
  fetchCriteria,
  fetchCriteriaList,
  type CriteriaSummary,
} from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { getErrorMessage } from '@/lib/error'
import { formatDateTime } from '@/lib/format'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { UButton, UDropdownMenu, UIcon, UModal } from '@/ui'

const router = useRouter()
const auth = useAuthStore()

const list = ref<CriteriaSummary[] | null>(null)
const loading = ref(true)
const preview = ref<CriterionItem[]>([])
const previewOpen = ref(false)
const deleteTarget = ref<CriteriaSummary | null>(null)
const deleteOpen = ref(false)
const deleting = ref(false)

const deleteDescription = computed(() =>
  deleteTarget.value
    ? `确定删除该评分标准吗？分享码 ${deleteTarget.value.key} 将失效。`
    : '确定删除该评分标准吗？',
)

const canManage = computed(() => auth.user != null)

async function load() {
  loading.value = true
  try {
    const res = await fetchCriteriaList()
    list.value = res.criteria
  } catch (error) {
    list.value = []
    toast.error(getErrorMessage(error, '加载失败'))
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})

async function copy(key: string) {
  if (await copyToClipboard(key)) toast.success('分享码已复制')
  else toast.error('复制失败，请手动复制')
}

async function openPreview(key: string) {
  try {
    const res = await fetchCriteria(key)
    preview.value = res.payload?.items ?? []
    previewOpen.value = true
  } catch (error) {
    toast.error(getErrorMessage(error, '加载失败'))
  }
}

function goCreate() {
  void router.push('/console/reports')
}

function goEdit(key: string) {
  void router.push(`/console/criteria/${key}/edit`)
}

function requestDelete(item: CriteriaSummary) {
  deleteTarget.value = item
  deleteOpen.value = true
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await deleteCriteria(deleteTarget.value.key)
    list.value = list.value?.filter((item) => item.key !== deleteTarget.value?.key) ?? list.value
    toast.success('已删除评分标准')
    deleteOpen.value = false
    deleteTarget.value = null
  } catch (error) {
    toast.error(getErrorMessage(error, '删除失败'))
  } finally {
    deleting.value = false
  }
}

function rowMenu(item: CriteriaSummary): DropdownMenuItem[][] {
  const inUse = item.usageCount > 0
  return [
    [
      {
        label: '编辑',
        icon: 'i-lucide-pencil',
        onSelect: () => goEdit(item.key),
      },
      {
        label: '预览',
        icon: 'i-lucide-eye',
        onSelect: () => {
          void openPreview(item.key)
        },
      },
      {
        label: '复制分享码',
        icon: 'i-lucide-copy',
        onSelect: () => {
          void copy(item.key)
        },
      },
      { type: 'separator' },
      {
        label: inUse ? `删除（使用中 ${item.usageCount} 处）` : '删除',
        icon: 'i-lucide-trash-2',
        color: 'error',
        disabled: inUse,
        onSelect: () => requestDelete(item),
      },
    ],
  ]
}
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <PageHeader title="评分标准管理">
      <template #actions>
        <UButton
          size="sm"
          color="primary"
          icon="i-lucide-plus"
          :disabled="!canManage"
          @click="goCreate"
        >
          新建评分标准
        </UButton>
      </template>
    </PageHeader>

    <SkeletonList v-if="loading" :rows="3" class="h-20 rounded-2xl" />

    <EmptyState
      v-else-if="!list || list.length === 0"
      icon="i-lucide-clipboard-list"
      title="还没有创建评分标准"
      hint="在报告批改页保存评分标准后，会出现在这里"
    />

    <div v-else class="flex flex-col gap-3">
      <Card v-for="(item, index) in list" :key="item.key" :index="index">
        <div class="flex flex-wrap items-center gap-3">
          <div class="min-w-0 flex-1">
            <div class="tabular truncate text-xs text-fg-muted">{{ item.key }}</div>
            <div class="mt-1 text-[11px] text-fg-subtle">
              更新于 {{ formatDateTime(item.updatedAt) }} · {{ item.cardCount }} 张卡片 ·
              <span :class="cn(item.usageCount > 0 && 'text-amber-600 dark:text-amber-400')">
                {{ item.usageCount > 0 ? `使用中 ${item.usageCount} 处` : '未被使用' }}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              size="sm"
              color="neutral"
              variant="soft"
              icon="i-lucide-eye"
              @click="openPreview(item.key)"
            >
              预览
            </UButton>
            <UDropdownMenu :items="rowMenu(item)">
              <UButton size="sm" square color="neutral" variant="soft" aria-label="更多操作">
                <UIcon name="i-lucide-ellipsis" class="h-4 w-4 shrink-0" />
              </UButton>
            </UDropdownMenu>
          </div>
        </div>
      </Card>
    </div>

    <UModal
      v-model:open="previewOpen"
      title="评分标准预览"
      :ui="{ content: 'sm:max-w-3xl' }"
    >
      <template #body>
        <CriteriaPreview :items="preview" />
      </template>
    </UModal>

    <ConfirmDialog
      v-model:open="deleteOpen"
      title="删除评分标准"
      :description="deleteDescription"
      confirm-text="删除"
      :loading="deleting"
      @confirm="confirmDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
