<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import CommentTemplateSection from '@/components/settings/CommentTemplateSection.vue'
import ConvenienceToolsSection from '@/components/settings/ConvenienceToolsSection.vue'
import DevBoardsSection from '@/components/settings/DevBoardsSection.vue'
import ExperimentScoringSection from '@/components/settings/ExperimentScoringSection.vue'
import FocusStudentsSection from '@/components/settings/FocusStudentsSection.vue'
import Card from '@/components/ui/Card.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import PendingButton from '@/components/ui/PendingButton.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import TableOfContents, { type TocItem } from '@/components/ui/TableOfContents.vue'
import { renameClass } from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { CHECKPOINT_RULES } from '@/lib/checkpoints'
import { getErrorMessage } from '@/lib/error'
import { useScrollToHash } from '@/lib/hash'
import { useCurrentClassComputed } from '@/lib/store'
import { toast } from '@/lib/toast'
import { useClassSettingsPatch } from '@/lib/use-class-settings'
import { cn } from '@/lib/utils'
import { UAlert, UButton, UInput, USelect, USwitch } from '@/ui'

const SECTIONS: TocItem[] = [
  { id: 'checkpoint', label: 'Checkpoint Settings' },
  { id: 'scoring', label: '实验计分方式' },
  { id: 'focus', label: '重点关注学生' },
  { id: 'boards', label: '开发板' },
  { id: 'comment', label: '评语模板' },
  { id: 'tools', label: '便捷工具' },
  { id: 'basic', label: '基本信息' },
  { id: 'roster', label: '学生名单' },
  { id: 'tas', label: '助教' },
  { id: 'xzzd', label: '学在浙大' },
]

const IMPLEMENTED_SECTIONS = new Set([
  'checkpoint',
  'scoring',
  'focus',
  'boards',
  'comment',
  'tools',
  'basic',
])

const PLACEHOLDER_SECTIONS = SECTIONS.filter(
  (section) => !IMPLEMENTED_SECTIONS.has(section.id),
)

const router = useRouter()
const auth = useAuthStore()
const currentClass = useCurrentClassComputed()
const classId = computed(() => currentClass.value?.id ?? null)

const highlightId = ref<string | null>(null)
let highlightTimer: ReturnType<typeof setTimeout> | null = null

function flashHighlight(id: string) {
  highlightId.value = id
  if (highlightTimer) clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => {
    highlightId.value = null
  }, 1600)
}

useScrollToHash(flashHighlight)

onUnmounted(() => {
  if (highlightTimer) clearTimeout(highlightTimer)
})

function sectionClass(id: string) {
  return cn(
    'scroll-mt-24 rounded-2xl transition-shadow duration-300',
    highlightId.value === id && 'ring-2 ring-brand-500/40 dark:ring-brand-400/50',
  )
}

const {
  settings,
  settingsLoading,
  patch,
  saving,
  rollbackFailed,
  dismissRollbackFailure,
} = useClassSettingsPatch(classId)

const checkpointBusy = computed(() => settingsLoading.value || saving.value)

function toggleCheckpoint(selected: boolean) {
  void patch({ checkpointEnabled: selected }, (prev) =>
    prev ? { ...prev, checkpointEnabled: selected } : { checkpointEnabled: selected },
  )
}

function setCheckpointRule(value: unknown) {
  const rule = value == null ? null : String(value)
  void patch({ checkpointRule: rule }, (prev) =>
    prev ? { ...prev, checkpointRule: rule } : { checkpointRule: rule },
  )
}

function goCheckpoints() {
  void router.push('/console/courses/checkpoints')
}

const name = ref(currentClass.value?.name ?? '')
const savingName = ref(false)

watch(
  () => [currentClass.value?.id, currentClass.value?.name] as const,
  () => {
    name.value = currentClass.value?.name ?? ''
  },
)

const className = computed(() => currentClass.value?.name ?? '')
const trimmedName = computed(() => name.value.trim())
const dirty = computed(
  () =>
    Boolean(currentClass.value) &&
    trimmedName.value.length > 0 &&
    trimmedName.value !== className.value,
)

async function saveBasic() {
  const target = currentClass.value
  if (!target || !dirty.value || savingName.value) return
  savingName.value = true
  try {
    const { class: updated } = await renameClass(target.id, trimmedName.value)
    name.value = updated.name
    toast.success('课程名称已更新')
    void auth.refresh().catch(() => {})
  } catch (error) {
    toast.error(getErrorMessage(error, '保存失败'))
  } finally {
    savingName.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-4xl">
    <PageHeader title="课程设置" />

    <div class="flex items-start gap-8">
      <div class="flex min-w-0 flex-1 flex-col gap-4">
        <section id="checkpoint" :class="sectionClass('checkpoint')">
          <Card :index="0">
            <SectionHeader icon="i-lucide-sliders-horizontal" :busy="checkpointBusy">
              Checkpoint Settings
            </SectionHeader>

            <p v-if="!classId" class="mt-3 text-xs text-fg-subtle">
              请先在右上角选择或绑定一个课程。
            </p>
            <div v-else class="mt-4 flex flex-col gap-3">
              <div class="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
                <div class="min-w-0">
                  <div class="text-xs font-semibold text-fg-muted">开启 Checkpoint 机制</div>
                  <div class="text-[11px] text-fg-subtle">
                    开启后按下方规则自动应用 Checkpoint 判分
                  </div>
                </div>
                <USwitch
                  aria-label="开启Checkpoint机制"
                  :model-value="settings?.checkpointEnabled ?? false"
                  :disabled="checkpointBusy"
                  @update:model-value="(value: boolean) => toggleCheckpoint(value)"
                />
              </div>

              <div class="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
                <div class="text-xs font-semibold text-fg-muted">Checkpoint 规则</div>
                <USelect
                  class="min-w-[12rem]"
                  aria-label="Checkpoint规则"
                  :disabled="checkpointBusy"
                  :model-value="settings?.checkpointRule ?? undefined"
                  placeholder="未选择规则"
                  :items="CHECKPOINT_RULES"
                  @update:model-value="setCheckpointRule"
                />
              </div>

              <UButton color="neutral" variant="soft" class="self-start" @click="goCheckpoints">
                管理 Checkpoints
              </UButton>

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
        </section>

        <section id="scoring" :class="sectionClass('scoring')">
          <ExperimentScoringSection :index="1" />
        </section>

        <section id="focus" :class="sectionClass('focus')">
          <FocusStudentsSection :index="2" />
        </section>

        <section id="boards" :class="sectionClass('boards')">
          <DevBoardsSection :index="3" />
        </section>

        <section id="comment" :class="sectionClass('comment')">
          <CommentTemplateSection :index="4" />
        </section>

        <section id="tools" :class="sectionClass('tools')">
          <ConvenienceToolsSection :index="5" />
        </section>

        <section id="basic" :class="sectionClass('basic')">
          <Card :index="6" class="flex flex-col gap-4">
            <SectionHeader icon="i-lucide-info">基本信息</SectionHeader>

            <p v-if="!currentClass" class="text-xs text-fg-subtle">
              请先在右上角选择或绑定一个课程。
            </p>
            <form v-else class="flex flex-col gap-4" @submit.prevent="saveBasic">
              <div>
                <label class="mb-1.5 block text-xs font-semibold text-fg-muted">课程名称</label>
                <UInput
                  v-model="name"
                  class="w-full"
                  placeholder="课程名称"
                  :maxlength="64"
                />
                <p class="mt-1.5 text-[11px] text-fg-subtle">
                  推荐课程名称包含任课教师名和年份。
                </p>
              </div>

              <div class="flex justify-end">
                <PendingButton
                  type="submit"
                  size="sm"
                  :disabled="!dirty"
                  :loading="savingName"
                  icon="i-lucide-check"
                >
                  保存
                </PendingButton>
              </div>
            </form>
          </Card>
        </section>

        <section
          v-for="(section, index) in PLACEHOLDER_SECTIONS"
          :id="section.id"
          :key="section.id"
          :class="sectionClass(section.id)"
        >
          <Card :index="index + 7">
            <h2 class="text-sm font-bold">{{ section.label }}</h2>
            <p class="mt-2 text-xs text-fg-subtle">此部分内容待补充。</p>
          </Card>
        </section>
      </div>

      <TableOfContents :items="SECTIONS" />
    </div>
  </div>
</template>
