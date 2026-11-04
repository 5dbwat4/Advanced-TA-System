<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import ScoreRatioEditor from '@/components/settings/ScoreRatioEditor.vue'
import Card from '@/components/ui/Card.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import {
  apiFetch,
  fetchClassSettings,
  updateClassSettings,
  type Experiment,
} from '@/lib/api'
import { getErrorMessage } from '@/lib/error'
import { DEFAULT_SCORE_RATIO, sanitizeScoreRatio } from '@/lib/scoring'
import { useCurrentClassComputed } from '@/lib/store'
import { toast } from '@/lib/toast'
import { useDebouncedSave, type ClassSettingsPatchBody } from '@/lib/use-class-settings'
import { UAlert, UButton, UModal, USwitch } from '@/ui'

const props = defineProps<{
  index: number
}>()

const currentClass = useCurrentClassComputed()
const classId = computed(() => currentClass.value?.id ?? null)

const loading = ref(false)
const saving = ref(false)
const unified = ref(false)
const ratio = ref<number[]>([...DEFAULT_SCORE_RATIO])
const experiments = ref<Experiment[]>([])
const draft = ref<number[]>([...DEFAULT_SCORE_RATIO])
const oneClickOpen = ref(false)

watch(
  classId,
  (id) => {
    if (!id) return
    let cancelled = false
    loading.value = true
    Promise.all([
      fetchClassSettings(id),
      apiFetch<{ experiments: Experiment[] }>('/api/experiments'),
    ])
      .then(([{ settings }, expRes]) => {
        if (cancelled) return
        unified.value = Boolean(settings.scoreRatioUnified)
        ratio.value = sanitizeScoreRatio(settings.scoreRatio)
        experiments.value = expRes.experiments.filter((exp) => exp.classId === id)
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

async function syncFromServer() {
  const id = classId.value
  if (!id) return
  try {
    const { settings } = await fetchClassSettings(id)
    unified.value = Boolean(settings.scoreRatioUnified)
    ratio.value = sanitizeScoreRatio(settings.scoreRatio)
  } catch {
    // 回滚失败时忽略，保持乐观值
  }
}

async function patch(body: ClassSettingsPatchBody): Promise<boolean> {
  const id = classId.value
  if (!id) return false
  saving.value = true
  try {
    await updateClassSettings(id, body)
    return true
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
    await syncFromServer()
    return false
  } finally {
    saving.value = false
  }
}

const ratioSave = useDebouncedSave(async () => {
  const ok = await patch({ scoreRatio: ratio.value })
  if (!ok) throw new Error('score ratio save failed')
}, 700)

function toggleUnified(selected: boolean) {
  ratioSave.cancel()
  unified.value = selected
  void patch({ scoreRatioUnified: selected, scoreRatio: ratio.value })
}

function changeRatio(next: number[]) {
  ratioSave.schedule()
  ratio.value = next
}

function updateDraft(next: number[]) {
  draft.value = next
}

function openOneClick() {
  draft.value = [...ratio.value]
  oneClickOpen.value = true
}

async function applyToAll() {
  const id = classId.value
  if (!id) return
  const experimentScoreRatios = Object.fromEntries(
    experiments.value.map((experiment) => [experiment.id, draft.value]),
  )
  saving.value = true
  try {
    const { settings } = await updateClassSettings(id, {
      scoreRatio: draft.value,
      experimentScoreRatios,
    })
    ratio.value = sanitizeScoreRatio(settings.scoreRatio)
    draft.value = sanitizeScoreRatio(settings.scoreRatio)
    toast.success(`已应用到 ${experiments.value.length} 个实验`)
    oneClickOpen.value = false
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    saving.value = false
  }
}

const busy = computed(() => loading.value || saving.value)
</script>

<template>
  <Card :index="props.index">
    <SectionHeader icon="i-lucide-percent" :busy="busy">实验计分方式</SectionHeader>

    <p v-if="!classId" class="mt-3 text-xs text-fg-subtle">
      请先在右上角选择或绑定一个课程。
    </p>
    <div v-else class="mt-4 flex flex-col gap-4">
      <div class="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
        <div class="min-w-0">
          <div class="text-xs font-semibold text-fg-muted">实验各项目采用统一评分占比</div>
          <div class="text-[11px] text-fg-subtle">开启后全课程所有实验共用下方评分占比</div>
        </div>
        <USwitch
          :model-value="unified"
          :disabled="busy"
          @update:model-value="(value: boolean) => toggleUnified(value)"
        />
      </div>

      <div v-if="unified" class="rounded-xl border border-line px-4 py-4">
        <div class="mb-3 text-xs font-semibold text-fg-muted">评分占比</div>
        <ScoreRatioEditor :value="ratio" :disabled="loading" @change="changeRatio" />
      </div>
      <UButton v-else color="neutral" variant="soft" class="self-start" @click="openOneClick">
        一键应用评分占比
      </UButton>

      <UAlert
        variant="subtle"
        v-if="ratioSave.saveFailed"
        color="warning"
        description="自动保存失败，修改尚未保存"
      />
    </div>

    <UModal
      v-model:open="oneClickOpen"
      title="一键应用评分占比"
      :description="`将下方占比应用到本课程的全部 ${experiments.length} 个实验。`"
    >
      <template #body>
        <ScoreRatioEditor :value="draft" @change="updateDraft" />
      </template>
      <template #footer>
        <UButton color="neutral" variant="soft" @click="oneClickOpen = false">取消</UButton>
        <PendingButton
          :loading="saving"
          :disabled="experiments.length === 0"
          @click="applyToAll"
        >
          应用到所有实验
        </PendingButton>
      </template>
    </UModal>
  </Card>
</template>