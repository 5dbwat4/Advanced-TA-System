<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import Card from '@/components/ui/Card.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import { listDevBoards, type DevBoard } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useCurrentClassComputed } from '@/lib/store'
import { toast } from '@/lib/toast'
import { UButton, UIcon } from '@/ui'

const props = withDefaults(
  defineProps<{
    index?: number
  }>(),
  {
    index: 0,
  },
)

const router = useRouter()
const currentClass = useCurrentClassComputed()
const classId = computed(() => currentClass.value?.id ?? null)

const boards = ref<DevBoard[]>([])
const loading = ref(false)

async function reload() {
  if (!classId.value) {
    boards.value = []
    return
  }
  loading.value = true
  try {
    const data = await listDevBoards(classId.value)
    boards.value = data.devBoards
  } catch (error) {
    toast.error(getErrorMessage(error, '加载开发板失败'))
  } finally {
    loading.value = false
  }
}

watch(classId, () => void reload(), { immediate: true })

const borrowedCount = computed(() => boards.value.filter((board) => board.borrowed).length)

function goBoards() {
  void router.push('/console/boards')
}
</script>

<template>
  <Card :index="props.index">
    <SectionHeader icon="i-lucide-circuit-board" :busy="loading">开发板</SectionHeader>

    <p v-if="!classId" class="mt-3 text-xs text-fg-subtle">
      请先在右上角选择或绑定一个课程。
    </p>
    <div v-else class="mt-4 flex flex-col gap-3">
      <div class="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
        <div class="min-w-0">
          <div class="text-xs font-semibold text-fg-muted">
            共 <span class="tabular">{{ boards.length }}</span> 块 · 已借出
            <span class="tabular">{{ borrowedCount }}</span>
          </div>
          <div class="text-[11px] text-fg-subtle">
            登记开发板、借出 / 归还、批量导入与扫码
          </div>
        </div>
        <UButton size="sm" color="neutral" variant="soft" @click="goBoards">
          <UIcon name="i-lucide-circuit-board" class="h-4 w-4 shrink-0" />
          管理开发板
        </UButton>
      </div>
    </div>
  </Card>
</template>