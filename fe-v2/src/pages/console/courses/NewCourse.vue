<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import Card from '@/components/ui/Card.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import { createClass } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { toast } from '@/lib/toast'
import { UButton, UInput, URadioGroup } from '@/ui'

type ClassType = '2026-sys1' | '2026-sys2' | '2026-sys3'
type NewCourseState = {
  bindToken?: string
  courseId?: string
  courseName?: string
}

const TYPE_OPTIONS: Array<{ value: ClassType; label: string }> = [
  { value: '2026-sys1', label: '系统I' },
  { value: '2026-sys2', label: '系统II' },
  { value: '2026-sys3', label: '系统III' },
]

const router = useRouter()
const state = (window.history.state as NewCourseState | null) ?? null
const bindToken = state?.bindToken ?? ''
const courseId = state?.courseId ?? ''
const name = ref(state?.courseName ?? '')
const type = ref<ClassType>('2026-sys1')
const saving = ref(false)

function setType(value: unknown) {
  if (value === '2026-sys1' || value === '2026-sys2' || value === '2026-sys3') {
    type.value = value
  }
}

async function submit() {
  if (!bindToken) {
    toast.error('缺少课程绑定授权，请重新获取课程')
    return
  }
  saving.value = true
  try {
    const result = await createClass({ bindToken, name: name.value.trim(), type: type.value })
    void router.push({
      path: '/console/courses/new-account',
      replace: true,
      state: {
        bindToken,
        classId: result.class.id,
        className: result.class.name,
      },
    })
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <PageHeader title="添加课程" />

    <Card v-if="!bindToken" :index="0" class="flex flex-col items-center gap-4 py-10 text-center">
      <p class="text-sm text-danger">缺少课程绑定授权，请从“助教绑定课程”重新获取课程。</p>
      <UButton color="neutral" variant="soft" @click="router.push('/console/settings')">
        返回设置
      </UButton>
    </Card>

    <form v-else @submit.prevent="submit">
      <Card :index="0" class="flex flex-col gap-4">
        <div>
          <label class="mb-1.5 block text-xs font-semibold text-fg-muted">学在浙大id</label>
          <UInput
            class="tabular w-full disabled:opacity-60"
            :model-value="courseId"
            disabled
          />
        </div>

        <div>
          <label class="mb-1.5 block text-xs font-semibold text-fg-muted">名称</label>
          <UInput
            v-model="name"
            class="w-full"
            placeholder="课程名称"
            :maxlength="64"
            required
          />
        </div>

        <div>
          <label class="mb-1.5 block text-xs font-semibold text-fg-muted">类别</label>
          <URadioGroup
            :model-value="type"
            :items="TYPE_OPTIONS"
            value-key="value"
            label-key="label"
            orientation="horizontal"
            @update:model-value="setType"
          />
        </div>

        <PendingButton
          type="submit"
          block
          color="primary"
          :loading="saving"
          :disabled="!name.trim()"
          class="mt-2"
          icon="i-lucide-check"
          loading-label="保存中"
        >
          保存并继续
        </PendingButton>

        <UButton variant="ghost" block @click="router.back()">取消</UButton>
      </Card>
    </form>
  </div>
</template>
