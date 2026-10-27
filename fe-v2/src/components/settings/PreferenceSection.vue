<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import MarkdownStyleChoice from '@/components/settings/MarkdownStyleChoice.vue'
import PreferenceRow from '@/components/settings/PreferenceRow.vue'
import Card from '@/components/ui/Card.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import type { MarkdownStyleId } from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { createDefaultCustomCards } from '@/lib/custom-cards'
import { getErrorMessage } from '@/lib/error'
import { toast } from '@/lib/toast'
import { UButton, UIcon, UInputNumber } from '@/ui'

const props = withDefaults(
  defineProps<{
    index?: number
    markdownOnly?: boolean
  }>(),
  {
    index: 0,
    markdownOnly: false,
  },
)

const auth = useAuthStore()
const router = useRouter()

const saved = computed(() => auth.user?.preferences ?? null)
const device = ref<'single' | 'multi'>(saved.value?.device ?? 'single')
const draw = ref<'random' | 'fixed'>(saved.value?.draw ?? 'random')
const markdownStyle = ref<MarkdownStyleId>(saved.value?.markdownStyle ?? 'github')
const drawCount = ref<number>(saved.value?.drawCount ?? 3)
const saving = ref(false)

const dirty = computed(() => {
  const value = saved.value
  if (value == null) return true
  if (props.markdownOnly) return markdownStyle.value !== value.markdownStyle
  return (
    device.value !== value.device ||
    draw.value !== value.draw ||
    markdownStyle.value !== value.markdownStyle ||
    drawCount.value !== value.drawCount
  )
})

async function save() {
  saving.value = true
  try {
    await auth.updatePreferences({
      device: props.markdownOnly ? (saved.value?.device ?? device.value) : device.value,
      draw: props.markdownOnly ? (saved.value?.draw ?? draw.value) : draw.value,
      markdownEditor: saved.value?.markdownEditor ?? 'uiw',
      markdownStyle: markdownStyle.value,
      drawCount: props.markdownOnly ? (saved.value?.drawCount ?? drawCount.value) : drawCount.value,
      customCards: saved.value?.customCards ?? createDefaultCustomCards(),
    })
    toast.success('偏好已保存')
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    saving.value = false
  }
}

function setDrawCount(value: number | null) {
  drawCount.value = value ?? 1
}

function goCustomCards() {
  void router.push('/console/checkoff/cards')
}
</script>

<template>
  <Card :index="props.index" class="flex flex-col gap-5">
    <div class="flex items-center gap-2 text-sm font-bold">
      <UIcon
        name="i-lucide-sliders-horizontal"
        class="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-300"
      />
      偏好设置
    </div>

    <template v-if="!props.markdownOnly">
      <PreferenceRow
        title="是否打算使用多台设备？"
        :hint="device === 'single' ? '一台设备完成抽题与评分' : '分屏协作，一台抽题一台评分'"
      >
        <UButton
          size="sm"
          :variant="device === 'single' ? 'solid' : 'soft'"
          @click="device = 'single'"
        >
          单设备
        </UButton>
        <UButton
          size="sm"
          :variant="device === 'multi' ? 'solid' : 'soft'"
          @click="device = 'multi'"
        >
          多设备
        </UButton>
      </PreferenceRow>

      <PreferenceRow
        title="希望随机抽题还是固定选题？"
        :hint="draw === 'random' ? '现场为每位学生随机抽取题目' : '从题库中手动挑选题目'"
      >
        <UButton
          size="sm"
          :variant="draw === 'random' ? 'solid' : 'soft'"
          @click="draw = 'random'"
        >
          随机抽题
        </UButton>
        <UButton
          size="sm"
          :variant="draw === 'fixed' ? 'solid' : 'soft'"
          @click="draw = 'fixed'"
        >
          选择题目
        </UButton>
      </PreferenceRow>

      <PreferenceRow title="自定义抽题数目" hint="现场随机抽题时抽取的题目数量">
        <UInputNumber
          :model-value="drawCount"
          :min="1"
          :max="10"
          class="w-24"
          @update:model-value="setDrawCount"
        />
      </PreferenceRow>

      <PreferenceRow title="配置自定义 Card" hint="在验收页底部展示可切换的 Card">
        <UButton size="sm" color="neutral" variant="soft" @click="goCustomCards">
          <UIcon name="i-lucide-layout-grid" class="h-3.5 w-3.5 shrink-0" />
          配置
          <UIcon name="i-lucide-arrow-right" class="h-3.5 w-3.5 shrink-0" />
        </UButton>
      </PreferenceRow>
    </template>

    <MarkdownStyleChoice
      :value="markdownStyle"
      @change="(value: MarkdownStyleId) => (markdownStyle = value)"
    />

    <div class="flex justify-end">
      <PendingButton
        size="sm"
        :disabled="!dirty"
        :loading="saving"
        icon="i-lucide-check"
        @click="save"
      >
        保存偏好
      </PendingButton>
    </div>
  </Card>
</template>