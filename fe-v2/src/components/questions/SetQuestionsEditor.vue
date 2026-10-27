<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import QuestionPicker from '@/components/questions/QuestionPicker.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import { fetchBankQuestions, setBankQuestions, type Question, type QuestionBank } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { toast } from '@/lib/toast'
import { UButton } from '@/ui'

const props = defineProps<{
  bank: QuestionBank
}>()

const emit = defineEmits<{
  saved: []
}>()

const selected = ref<string[]>([...props.bank.questions])
const members = ref<Question[]>([])
const saving = ref(false)

const initialSet = computed(() => new Set(props.bank.questions))
const dirty = computed(
  () =>
    selected.value.length !== initialSet.value.size ||
    selected.value.some((id) => !initialSet.value.has(id)),
)

let membersSeq = 0

async function loadMembers(bankId: string) {
  const seq = ++membersSeq
  try {
    const data = await fetchBankQuestions(bankId)
    if (seq === membersSeq) members.value = data.questions
  } catch (error) {
    if (seq === membersSeq) toast.error(getErrorMessage(error, '加载失败'))
  }
}

watch(
  () => props.bank.id,
  (id) => {
    selected.value = [...props.bank.questions]
    members.value = []
    void loadMembers(id)
  },
  { immediate: true },
)

function reset() {
  selected.value = [...props.bank.questions]
}

async function save() {
  saving.value = true
  try {
    await setBankQuestions(props.bank.id, selected.value)
    toast.success('题目集已保存')
    emit('saved')
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <QuestionPicker v-model:selected="selected" :initial-questions="members" :dirty="dirty" />

    <div class="flex items-center justify-end gap-2 border-t border-line pt-3">
      <UButton size="sm" color="neutral" variant="ghost" :disabled="!dirty" @click="reset">
        重置
      </UButton>
      <PendingButton
        size="sm"
        color="primary"
        :loading="saving"
        :disabled="!dirty"
        icon="i-lucide-check"
        @click="save"
      >
        保存题目集
      </PendingButton>
    </div>
  </div>
</template>
