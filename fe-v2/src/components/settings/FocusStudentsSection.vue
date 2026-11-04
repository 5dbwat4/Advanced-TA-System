<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import Card from '@/components/ui/Card.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import { listFocusStudents, type FocusStudent } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useCurrentClassComputed } from '@/lib/store'
import { toast } from '@/lib/toast'
import { useClassSettingsPatch } from '@/lib/use-class-settings'
import { UAlert, UButton, UIcon, USwitch } from '@/ui'

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

const {
  settings,
  settingsLoading,
  patch,
  saving,
  rollbackFailed,
  dismissRollbackFailure,
} = useClassSettingsPatch(classId)

const focusStudents = ref<FocusStudent[]>([])
const loading = ref(false)

async function reload() {
  if (!classId.value) {
    focusStudents.value = []
    return
  }
  loading.value = true
  try {
    const data = await listFocusStudents(classId.value)
    focusStudents.value = data.focusStudents
  } catch (error) {
    toast.error(getErrorMessage(error, '加载重点关注学生失败'))
  } finally {
    loading.value = false
  }
}

watch(classId, () => void reload(), { immediate: true })

const busy = computed(() => settingsLoading.value || saving.value || loading.value)

function toggleFocus(selected: boolean) {
  void patch(
    { focusEnabled: selected },
    (prev) => (prev ? { ...prev, focusEnabled: selected } : { focusEnabled: selected }),
  )
}

function goFocusStudents() {
  void router.push('/console/courses/focus-students')
}
</script>

<template>
  <Card :index="props.index">
    <SectionHeader icon="i-lucide-user-search" :busy="busy">重点关注学生</SectionHeader>

    <p v-if="!classId" class="mt-3 text-xs text-fg-subtle">
      请先在右上角选择或绑定一个课程。
    </p>
    <div v-else class="mt-4 flex flex-col gap-3">
      <div class="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
        <div class="min-w-0">
          <div class="text-xs font-semibold text-fg-muted">启用「重点关注学生」</div>
          <div class="text-[11px] text-fg-subtle">
            开启后可在验收等场景中提示重点关注学生
          </div>
        </div>
        <USwitch
          :model-value="settings?.focusEnabled ?? false"
          :disabled="busy"
          @update:model-value="(value: boolean) => toggleFocus(value)"
        />
      </div>

      <div class="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
        <div class="min-w-0">
          <div class="text-xs font-semibold text-fg-muted">重点关注学生列表</div>
          <div class="text-[11px] text-fg-subtle">
            查看与维护本课程需要重点关注的学生及原因
          </div>
        </div>
        <UButton size="sm" color="neutral" variant="soft" @click="goFocusStudents">
          <UIcon name="i-lucide-list-checks" class="h-4 w-4 shrink-0" />
          重点关注学生列表（{{ focusStudents.length }}人）
        </UButton>
      </div>

      <UAlert
        variant="subtle"
        v-if="rollbackFailed"
        color="error"
        description="设置保存失败且无法恢复，请刷新页面"
        close
        @update:open="dismissRollbackFailure"
      />
    </div>
  </Card>
</template>