<script setup lang="ts">
import { computed } from 'vue'

import PendingButton from '@/components/ui/PendingButton.vue'
import { UButton, UIcon, UModal } from '@/ui'

const props = withDefaults(
  defineProps<{
    open?: boolean
    title: string
    description?: string
    confirmText?: string
    cancelText?: string
    danger?: boolean
    loading?: boolean
    icon?: string
  }>(),
  {
    open: false,
    description: '',
    confirmText: '删除',
    cancelText: '取消',
    danger: true,
    loading: false,
    icon: 'i-lucide-trash-2',
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
  cancel: []
}>()

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
})

const loadingLabel = computed(() => (props.danger ? '删除中…' : '处理中…'))

function onCancel() {
  emit('cancel')
  isOpen.value = false
}
</script>

<template>
  <UModal v-model:open="isOpen" :dismissible="!loading" :ui="{ content: 'sm:max-w-md' }">
    <template #header="{ close }">
      <div class="flex items-start gap-3">
        <div
          :class="
            props.danger
              ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger'
              : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300'
          "
        >
          <UIcon :name="props.icon" class="h-[18px] w-[18px] shrink-0" />
        </div>
        <h2 class="flex-1 text-base font-semibold leading-9">{{ props.title }}</h2>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          square
          aria-label="关闭"
          @click="close"
        />
      </div>
    </template>

    <template #body>
      <slot>
        <p v-if="props.description" class="text-sm text-fg-muted">{{ props.description }}</p>
      </slot>
    </template>

    <template #footer>
      <slot name="actions" />
      <UButton color="neutral" variant="soft" @click="onCancel">{{ props.cancelText }}</UButton>
      <PendingButton
        :color="props.danger ? 'error' : 'primary'"
        :loading="props.loading"
        :loading-label="loadingLabel"
        @click="emit('confirm')"
      >
        {{ props.confirmText }}
      </PendingButton>
    </template>
  </UModal>
</template>
