<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

import { fetchRemark, saveRemark } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { toast } from '@/lib/toast'
import { UTextarea } from '@/ui'

const props = defineProps<{
  userId: string | null
  experimentId: string
  type: number
  sync?: { nonce: number; text: string }
}>()

const text = ref('')
const loading = ref(false)
const saving = ref(false)
const saved = ref('')

let loadSeq = 0
let timer: ReturnType<typeof setTimeout> | null = null

function clearTimer() {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}

watch(
  () => props.sync,
  (sync) => {
    if (sync) text.value = sync.text
  },
)

watch(
  [() => props.userId, () => props.experimentId, () => props.type],
  () => {
    const seq = ++loadSeq
    if (!props.userId) {
      text.value = ''
      saved.value = ''
      loading.value = false
      return
    }
    loading.value = true
    fetchRemark(props.userId, props.experimentId, props.type)
      .then((remark) => {
        if (seq !== loadSeq) return
        const next = remark?.text ?? ''
        text.value = next
        saved.value = next
      })
      .catch(() => {})
      .finally(() => {
        if (seq === loadSeq) loading.value = false
      })
  },
  { immediate: true },
)

async function persist(value: string) {
  if (!props.userId || value === saved.value) return
  saving.value = true
  try {
    await saveRemark({
      userId: props.userId,
      experimentId: props.experimentId,
      type: props.type,
      text: value,
    })
    saved.value = value
  } catch (error) {
    toast.error(getErrorMessage(error, '附言保存失败'))
  } finally {
    saving.value = false
  }
}

watch([text, loading, () => props.userId], () => {
  clearTimer()
  if (loading.value || !props.userId || text.value === saved.value) return
  timer = setTimeout(() => {
    timer = null
    void persist(text.value)
  }, 800)
})

function onBlur() {
  clearTimer()
  if (loading.value || !props.userId) return
  void persist(text.value)
}

onBeforeUnmount(clearTimer)
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs font-semibold text-fg-muted">附言</span>
      <span v-if="saving" class="text-[11px] text-fg-subtle">保存中…</span>
    </div>
    <UTextarea
      v-model="text"
      :rows="3"
      :disabled="loading || !props.userId"
      :placeholder="props.userId ? '可以是评价、说明、鼓励等等' : '请先选择学生'"
      aria-label="附言"
      :style="{ resize: 'vertical' }"
      @blur="onBlur"
    />
  </div>
</template>
