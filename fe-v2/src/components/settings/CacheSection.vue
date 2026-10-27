<script setup lang="ts">
import { createStore, entries, clear } from 'idb-keyval'
import { computed, onMounted, ref } from 'vue'

import Card from '@/components/ui/Card.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import { getErrorMessage } from '@/lib/error'
import { formatBytes } from '@/lib/format'
import { clearPageCache, getPageCacheBytes } from '@/lib/page-cache'
import { toast } from '@/lib/toast'

const props = withDefaults(
  defineProps<{
    index?: number
  }>(),
  {
    index: 0,
  },
)

type CacheKind = 'reports' | 'pages'

type CachedAttachment = {
  size: number
}

const reportStore = createStore('tasaas', 'report-attachments')

const reportBytes = ref<number | null>(null)
const pageBytes = ref<number | null>(null)
const clearing = ref<CacheKind | null>(null)

async function getReportCacheBytes(): Promise<number> {
  try {
    const all = await entries<number, CachedAttachment>(reportStore)
    return all.reduce((sum, [, record]) => sum + record.size, 0)
  } catch {
    return 0
  }
}

async function clearReportCache(): Promise<void> {
  await clear(reportStore)
}

onMounted(() => {
  getReportCacheBytes()
    .then((value) => {
      reportBytes.value = value
    })
    .catch(() => {})
  getPageCacheBytes()
    .then((value) => {
      pageBytes.value = value
    })
    .catch(() => {})
})

const reportsDisabled = computed(() => clearing.value !== null || reportBytes.value === 0)
const pagesDisabled = computed(() => clearing.value !== null || pageBytes.value === 0)

async function clearReports() {
  clearing.value = 'reports'
  try {
    await clearReportCache()
    reportBytes.value = 0
    toast.success('实验报告缓存已清空')
  } catch (error) {
    toast.error(getErrorMessage(error, '清空失败'))
  } finally {
    clearing.value = null
  }
}

async function clearPages() {
  clearing.value = 'pages'
  try {
    await clearPageCache()
    pageBytes.value = 0
    toast.success('页面资源缓存已清空')
  } catch (error) {
    toast.error(getErrorMessage(error, '清空失败'))
  } finally {
    clearing.value = null
  }
}
</script>

<template>
  <Card :index="props.index" class="flex flex-col gap-4">
    <SectionHeader icon="i-lucide-database">缓存</SectionHeader>

    <div class="flex items-center justify-between gap-3 rounded-xl border border-line bg-sunken px-4 py-3">
      <div class="min-w-0 flex-1">
        <div class="text-xs font-semibold text-fg-muted">实验报告缓存</div>
        <div class="text-[11px] text-fg-subtle">
          报告批改时下载的附件会缓存在浏览器中，以加快再次打开的速度。
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <span class="tabular text-sm font-semibold text-fg">
          {{ reportBytes == null ? '—' : formatBytes(reportBytes) }}
        </span>
        <PendingButton
          size="sm"
          color="neutral" variant="soft"
          :disabled="reportsDisabled"
          :loading="clearing === 'reports'"
          icon="i-lucide-trash-2"
          @click="clearReports"
        >
          清空
        </PendingButton>
      </div>
    </div>

    <div class="flex items-center justify-between gap-3 rounded-xl border border-line bg-sunken px-4 py-3">
      <div class="min-w-0 flex-1">
        <div class="text-xs font-semibold text-fg-muted">页面资源缓存</div>
        <div class="text-[11px] text-fg-subtle">
          应用页面、脚本和样式会缓存在浏览器中，以加快再次访问和弱网加载的速度。
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <span class="tabular text-sm font-semibold text-fg">
          {{ pageBytes == null ? '—' : formatBytes(pageBytes) }}
        </span>
        <PendingButton
          size="sm"
          color="neutral" variant="soft"
          :disabled="pagesDisabled"
          :loading="clearing === 'pages'"
          icon="i-lucide-trash-2"
          @click="clearPages"
        >
          清空
        </PendingButton>
      </div>
    </div>
  </Card>
</template>