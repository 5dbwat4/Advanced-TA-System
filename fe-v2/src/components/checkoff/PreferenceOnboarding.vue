<script setup lang="ts">
import { computed, getCurrentInstance, ref } from 'vue'
import { useRouter } from 'vue-router'

import PreferenceRow from '@/components/settings/PreferenceRow.vue'
import Card from '@/components/ui/Card.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import type { UserPreferences } from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { createDefaultCustomCards } from '@/lib/custom-cards'
import { getErrorMessage } from '@/lib/error'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { UButton, UIcon, UInputNumber } from '@/ui'

const props = withDefaults(
  defineProps<{
    initial?: UserPreferences | null
    layout?: 'cards' | 'rows'
  }>(),
  {
    initial: null,
    layout: 'cards',
  },
)

const emit = defineEmits<{
  saved: [prefs: UserPreferences]
  cancel: []
}>()

const auth = useAuthStore()
const router = useRouter()
const instance = getCurrentInstance()

const device = ref<'single' | 'multi'>(props.initial?.device ?? 'single')
const draw = ref<'random' | 'fixed'>(props.initial?.draw ?? 'random')
const drawCount = ref<number>(props.initial?.drawCount ?? 3)
const saving = ref(false)

const showCancel = computed(
  () => props.initial !== null && typeof instance?.vnode.props?.onCancel === 'function',
)

const deviceChoices: {
  value: 'single' | 'multi'
  icon: string
  title: string
  desc: string
}[] = [
  {
    value: 'single',
    icon: 'i-lucide-laptop',
    title: '单设备',
    desc: '一台设备完成抽题与评分',
  },
  {
    value: 'multi',
    icon: 'i-lucide-monitor-smartphone',
    title: '多设备',
    desc: '分屏协作，一台抽题一台评分',
  },
]

const drawChoices: {
  value: 'random' | 'fixed'
  icon: string
  title: string
  desc: string
}[] = [
  {
    value: 'random',
    icon: 'i-lucide-dices',
    title: '随机抽题',
    desc: '现场为每位学生随机抽取题目',
  },
  {
    value: 'fixed',
    icon: 'i-lucide-list-checks',
    title: '选择题目',
    desc: '从题库中手动挑选题目',
  },
]

function setDrawCount(value: number | null) {
  drawCount.value = value ?? 1
}

function goCustomCards() {
  void router.push('/console/checkoff/cards')
}

async function save() {
  saving.value = true
  try {
    const prefs: UserPreferences = {
      device: device.value,
      draw: draw.value,
      markdownEditor: props.initial?.markdownEditor ?? 'uiw',
      markdownStyle: props.initial?.markdownStyle ?? 'github',
      drawCount: drawCount.value,
      customCards: props.initial?.customCards ?? createDefaultCustomCards(),
    }
    await auth.updatePreferences(prefs)
    toast.success('偏好已保存')
    emit('saved', prefs)
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Card class="flex flex-col gap-6 p-7">
    <div class="flex items-center gap-3">
      <span
        class="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500/15 to-amber-500/10 text-brand-600 dark:text-brand-300"
      >
        <UIcon name="i-lucide-sliders-horizontal" class="size-[21px] shrink-0" />
      </span>
      <div>
        <h2 class="text-lg font-bold text-fg">偏好选择</h2>
        <p class="text-xs text-fg-subtle">开始验收前，请先确认你的验收方式</p>
      </div>
    </div>

    <template v-if="props.layout === 'rows'">
      <div class="flex flex-col gap-3">
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
            <UIcon name="i-lucide-layout-grid" class="size-3.5 shrink-0" />
            配置
            <UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0" />
          </UButton>
        </PreferenceRow>
      </div>
    </template>

    <template v-else>
      <div class="flex flex-col gap-3">
        <div class="text-sm font-semibold text-fg">是否打算使用多台设备？</div>
        <div class="grid gap-3 sm:grid-cols-2">
          <button
            v-for="choice in deviceChoices"
            :key="choice.value"
            type="button"
            :class="
              cn(
                'relative flex w-full flex-col items-start justify-start gap-2 whitespace-normal rounded-2xl border-2 p-5 text-left transition-all',
                device === choice.value
                  ? 'border-brand-500 bg-brand-500/5 ring-2 ring-brand-500/25'
                  : 'border-line bg-elevated hover:border-brand-500/40 hover:bg-brand-500/5',
              )
            "
            @click="device = choice.value"
          >
            <span
              :class="
                cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl',
                  device === choice.value
                    ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white'
                    : 'bg-sunken text-fg-muted',
                )
              "
            >
              <UIcon :name="choice.icon" class="size-[19px] shrink-0" />
            </span>
            <span class="text-sm font-bold text-fg">{{ choice.title }}</span>
            <span class="text-xs font-normal text-fg-subtle">{{ choice.desc }}</span>
            <span
              v-if="device === choice.value"
              class="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white shadow-md"
            >
              <UIcon name="i-lucide-check" class="size-3 shrink-0" />
            </span>
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-3">
        <div class="text-sm font-semibold text-fg">希望随机抽题还是固定选题？</div>
        <div class="grid gap-3 sm:grid-cols-2">
          <button
            v-for="choice in drawChoices"
            :key="choice.value"
            type="button"
            :class="
              cn(
                'relative flex w-full flex-col items-start justify-start gap-2 whitespace-normal rounded-2xl border-2 p-5 text-left transition-all',
                draw === choice.value
                  ? 'border-brand-500 bg-brand-500/5 ring-2 ring-brand-500/25'
                  : 'border-line bg-elevated hover:border-brand-500/40 hover:bg-brand-500/5',
              )
            "
            @click="draw = choice.value"
          >
            <span
              :class="
                cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl',
                  draw === choice.value
                    ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white'
                    : 'bg-sunken text-fg-muted',
                )
              "
            >
              <UIcon :name="choice.icon" class="size-[19px] shrink-0" />
            </span>
            <span class="text-sm font-bold text-fg">{{ choice.title }}</span>
            <span class="text-xs font-normal text-fg-subtle">{{ choice.desc }}</span>
            <span
              v-if="draw === choice.value"
              class="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white shadow-md"
            >
              <UIcon name="i-lucide-check" class="size-3 shrink-0" />
            </span>
          </button>
        </div>
      </div>

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
          <UIcon name="i-lucide-layout-grid" class="size-3.5 shrink-0" />
          配置
          <UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0" />
        </UButton>
      </PreferenceRow>
    </template>

    <div class="flex justify-end gap-2">
      <UButton v-if="showCancel" type="button" variant="ghost" :disabled="saving" @click="emit('cancel')">
        取消
      </UButton>
      <PendingButton
        type="button"
        size="lg"
        :loading="saving"
        icon="i-lucide-rocket"
        class="bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
        @click="save"
      >
        {{ props.initial ? '保存' : '开始验收' }}
      </PendingButton>
    </div>
  </Card>
</template>