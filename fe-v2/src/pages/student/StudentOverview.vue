<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import ExperimentGantt from '@/components/experiments/ExperimentGantt.vue'
import Spinner from '@/components/ui/Spinner.vue'
import { fetchStudentOverview, type StudentOverview } from '@/lib/api'
import { getErrorMessage } from '@/lib/error'

const router = useRouter()

const data = ref<StudentOverview | null>(null)
const error = ref<string | null>(null)
const loading = ref(true)

const scored = computed(
  () => data.value?.experiments.filter((experiment) => experiment.total != null) ?? [],
)

function openExperiment(id: string) {
  void router.push(`/student-console/experiments/${id}`)
}

onMounted(async () => {
  try {
    data.value = await fetchStudentOverview()
  } catch (err) {
    error.value = getErrorMessage(err, '加载失败')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <div v-if="loading" class="flex justify-center py-20">
      <Spinner size="lg" />
    </div>

    <div
      v-else-if="error"
      class="rounded-3xl border border-line bg-elevated/80 p-8 text-center text-sm text-danger"
    >
      {{ error }}
    </div>

    <template v-else-if="data">
      <section class="rounded-3xl border border-line bg-elevated/80 p-6 shadow-2xl backdrop-blur-xl">
        <div class="text-xs font-semibold tracking-widest text-fg-subtle">
          {{ data.class?.name ?? '未绑定班级' }}
        </div>
        <h1 class="mt-2 text-2xl font-bold tracking-tight">{{ data.student.name }}</h1>
        <div class="tabular mt-1 text-sm text-fg-subtle">{{ data.student.studentId || '—' }}</div>
        <div class="mt-5 grid gap-3 sm:grid-cols-2">
          <div class="rounded-2xl border border-line bg-sunken px-4 py-3">
            <div class="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
              实验数
            </div>
            <div class="tabular mt-1 text-xl font-bold">{{ data.experiments.length }}</div>
          </div>
          <div class="rounded-2xl border border-line bg-sunken px-4 py-3">
            <div class="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
              已出分
            </div>
            <div class="tabular mt-1 text-xl font-bold">{{ scored.length }}</div>
          </div>
        </div>
      </section>

      <div class="mt-6">
        <ExperimentGantt
          :experiments="data.experiments"
          show-total
          clickable
          @select="openExperiment"
        />
      </div>
    </template>
  </div>
</template>
