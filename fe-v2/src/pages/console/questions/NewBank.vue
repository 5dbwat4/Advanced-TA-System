<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import QuestionPicker from '@/components/questions/QuestionPicker.vue'
import BackLink from '@/components/ui/BackLink.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import { createBank, setBankQuestions } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { toast } from '@/lib/toast'
import { UInput } from '@/ui'

const router = useRouter()

const name = ref('')
const selected = ref<string[]>([])
const saving = ref(false)

async function submit() {
  if (!name.value.trim()) return
  saving.value = true
  try {
    const { bank } = await createBank(name.value.trim())
    if (selected.value.length > 0) {
      try {
        await setBankQuestions(bank.id, selected.value)
      } catch (error) {
        toast.error(getErrorMessage(error, '题目保存失败，可稍后在题目集页面添加'))
      }
    }
    toast.success('已创建题目集')
    void router.replace(`/console/questions/banks/${bank.id}`)
  } catch (error) {
    toast.error(getErrorMessage(error, '创建失败'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="w-full">
    <BackLink to="/console/questions?tab=sets">返回题库</BackLink>

    <PageHeader title="新建题目集" />

    <form class="flex flex-col gap-5" @submit.prevent="submit">
      <div class="rounded-2xl border border-line bg-elevated p-6">
        <label class="mb-1.5 block text-xs font-semibold text-fg-muted">题目集名称</label>
        <UInput
          v-model="name"
          class="w-full"
          placeholder="如：系统II 流水线题集"
          maxlength="64"
          autofocus
          required
          aria-label="题目集名称"
        />
      </div>

      <div class="rounded-2xl border border-line bg-elevated p-6">
        <div class="mb-4 text-sm font-bold">选择题目</div>
        <QuestionPicker v-model:selected="selected" />
      </div>

      <div class="flex justify-end">
        <PendingButton
          type="submit"
          color="primary"
          :loading="saving"
          :disabled="!name.trim()"
          icon="i-lucide-check"
          loading-label="创建中"
        >
          {{ selected.length > 0 ? `创建题目集（${selected.length} 题）` : '创建题目集' }}
        </PendingButton>
      </div>
    </form>
  </div>
</template>
