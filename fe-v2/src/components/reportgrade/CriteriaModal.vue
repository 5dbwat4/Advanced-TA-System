<script setup lang="ts">
import { ref } from 'vue'

import CriteriaPreview from '@/components/criteria/CriteriaPreview.vue'
import type { CriterionItem } from '@/components/criteria/types'
import PendingButton from '@/components/ui/PendingButton.vue'
import { fetchCriteria } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { toast } from '@/lib/toast'
import { UButton, UIcon, UInput, UModal } from '@/ui'

import { saveLocalDefaultRule, type LocalDefaultRule } from './default-rule'

const props = withDefaults(
  defineProps<{
    experimentId: string
    showStudentAction?: boolean
  }>(),
  {
    showStudentAction: false,
  },
)

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  apply: [items: CriterionItem[], key: string]
  'default-applied': [rule: LocalDefaultRule]
}>()

const shareCode = ref('')
const loading = ref(false)
const loadedCriteria = ref<CriterionItem[] | null>(null)
const loadedKey = ref<string | null>(null)

async function loadCriteria() {
  const code = shareCode.value.trim().toLowerCase()
  if (!/^[0-9a-f]{48}$/.test(code)) {
    toast.error('分享码格式不正确')
    return
  }
  loading.value = true
  try {
    const res = await fetchCriteria(code)
    const payload = res.payload
    if (!payload || !Array.isArray(payload.items)) {
      loadedCriteria.value = null
      loadedKey.value = null
      toast.error('评分标准内容无效')
      return
    }
    loadedCriteria.value = payload.items
    loadedKey.value = code
  } catch (err) {
    loadedCriteria.value = null
    loadedKey.value = null
    toast.error(getErrorMessage(err, '加载失败'))
  } finally {
    loading.value = false
  }
}

function confirmCriteria() {
  if (!loadedCriteria.value || !loadedKey.value) return
  emit('apply', loadedCriteria.value, loadedKey.value)
  open.value = false
  toast.success('已应用评分标准')
}

function applyDefaultRule() {
  if (!loadedCriteria.value || !loadedKey.value) return
  const rule: LocalDefaultRule = { key: loadedKey.value, items: loadedCriteria.value }
  void saveLocalDefaultRule(props.experimentId, rule)
  emit('default-applied', rule)
  open.value = false
  toast.success('已为本实验的未批改报告设置此评分标准（本地）')
}
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'sm:max-w-3xl' }">
    <template #header>
      <div class="flex items-center gap-2">
        <span
          class="flex size-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300"
        >
          <UIcon name="i-lucide-clipboard-list" class="size-[18px] shrink-0" />
        </span>
        <span class="text-base font-semibold">评分标准</span>
      </div>
    </template>
    <template #body>
      <div class="flex min-h-[38vh] flex-col gap-4">
        <div class="flex items-center gap-2">
          <UInput
            v-model="shareCode"
            class="flex-1"
            placeholder="输入评分标准分享码"
            aria-label="评分标准分享码"
            @keyup.enter="loadCriteria"
          />
          <PendingButton
            variant="soft"
            icon="i-lucide-file-down"
            loading-label="加载中"
            :loading="loading"
            :disabled="shareCode.trim() === ''"
            @click="loadCriteria"
          >
            加载
          </PendingButton>
        </div>
        <template v-if="loadedCriteria">
          <CriteriaPreview :items="loadedCriteria" />
          <UButton v-if="props.showStudentAction" class="w-full justify-center" @click="confirmCriteria">
            为该学生设定
          </UButton>
          <UButton
            :variant="props.showStudentAction ? 'soft' : 'solid'"
            class="w-full justify-center"
            @click="applyDefaultRule"
          >
            为该实验所有未批报告使用该评分标准
          </UButton>
        </template>
      </div>
    </template>
  </UModal>
</template>
