<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import Card from '@/components/ui/Card.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import { fetchClassSettings, updateClassSettings } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { useCurrentClassComputed } from '@/lib/store'
import { toast } from '@/lib/toast'
import { useDebouncedSave, type ClassSettingsPatchBody } from '@/lib/use-class-settings'
import { UAlert, UFormField, UTextarea } from '@/ui'

const props = defineProps<{
  index: number
}>()

const currentClass = useCurrentClassComputed()
const classId = computed(() => currentClass.value?.id ?? null)

const loading = ref(false)
const saving = ref(false)
const checkoutTemplate = ref('')
const reportTemplate = ref('')

watch(
  classId,
  (id) => {
    if (!id) {
      loading.value = false
      checkoutTemplate.value = ''
      reportTemplate.value = ''
      return
    }
    let cancelled = false
    loading.value = true
    fetchClassSettings(id)
      .then(({ settings }) => {
        if (cancelled) return
        checkoutTemplate.value = settings.checkoutCommentTemplate ?? ''
        reportTemplate.value = settings.reportCommentTemplate ?? ''
      })
      .catch((error: unknown) => {
        if (!cancelled) toast.error(getErrorMessage(error, '加载课程设置失败'))
      })
      .finally(() => {
        if (!cancelled) loading.value = false
      })
    return () => {
      cancelled = true
    }
  },
  { immediate: true },
)

async function patch(body: ClassSettingsPatchBody) {
  const id = classId.value
  if (!id) throw new Error('no class')
  saving.value = true
  try {
    await updateClassSettings(id, body)
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
    throw error
  } finally {
    saving.value = false
  }
}

const templateSave = useDebouncedSave(
  () =>
    patch({
      checkoutCommentTemplate: checkoutTemplate.value,
      reportCommentTemplate: reportTemplate.value,
    }),
  700,
)

const busy = computed(() => loading.value || saving.value)

function updateCheckout(value: string | number | undefined) {
  templateSave.schedule()
  checkoutTemplate.value = String(value ?? '')
}

function updateReport(value: string | number | undefined) {
  templateSave.schedule()
  reportTemplate.value = String(value ?? '')
}
</script>

<template>
  <Card :index="props.index">
    <SectionHeader icon="i-lucide-message-square-text" :busy="busy">评语模板</SectionHeader>

    <p v-if="!classId" class="mt-3 text-xs text-fg-subtle">
      请先在右上角选择或绑定一个课程。
    </p>
    <div v-else class="mt-4 flex flex-col gap-4">
      <UFormField label="验收评语模板">
        <UTextarea
          :model-value="checkoutTemplate"
          :rows="5"
          class="w-full"
          placeholder="输入验收评语模板…"
          :disabled="loading"
          :style="{ resize: 'vertical' }"
          @update:model-value="updateCheckout"
        />
      </UFormField>
      <UFormField label="报告评语模板">
        <UTextarea
          :model-value="reportTemplate"
          :rows="5"
          class="w-full"
          placeholder="输入报告评语模板…"
          :disabled="loading"
          :style="{ resize: 'vertical' }"
          @update:model-value="updateReport"
        />
      </UFormField>

      <UAlert
        variant="subtle"
        v-if="templateSave.saveFailed"
        color="warning"
        description="自动保存失败，修改尚未保存"
      />
    </div>
  </Card>
</template>
