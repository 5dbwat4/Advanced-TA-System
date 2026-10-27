<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import Spinner from '@/components/ui/Spinner.vue'
import { fetchStudentExperiment, type StudentPreviewData } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import StudentPreviewView from '@/pages/student/StudentPreviewView.vue'
import { UButton } from '@/ui'

const route = useRoute()
const router = useRouter()

const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''))
const data = ref<StudentPreviewData | null>(null)
const error = ref<string | null>(null)
const loading = ref(true)

async function load() {
  loading.value = true
  error.value = null
  try {
    data.value = await fetchStudentExperiment(id.value)
  } catch (err) {
    error.value = getErrorMessage(err, '加载失败')
  } finally {
    loading.value = false
  }
}

watch(id, load, { immediate: true })
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <UButton
      color="neutral"
      variant="ghost"
      size="sm"
      class="mb-3"
      icon="i-lucide-arrow-left"
      @click="router.push('/student-console')"
    >
      返回概览
    </UButton>

    <div v-if="loading" class="flex justify-center py-20">
      <Spinner size="lg" />
    </div>

    <div
      v-else-if="error"
      class="rounded-3xl border border-line bg-elevated/80 p-8 text-center text-sm text-danger"
    >
      {{ error }}
    </div>

    <StudentPreviewView v-else-if="data" :data="data" />
  </div>
</template>
