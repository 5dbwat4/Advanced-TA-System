<script setup lang="ts">
import { computed, ref } from 'vue'

import SearchInput from '@/components/ui/SearchInput.vue'
import { matchStudent } from '@/lib/pinyin'
import { cn } from '@/lib/utils'
import { UBadge, UButton, UIcon, UTooltip } from '@/ui'

import { formatScore, type GradeStudent, type StudentFlag } from './shared'

const props = defineProps<{
  students: GradeStudent[]
  selectedPersonId: number | null
  editorsByStuId: Map<string, string[]>
  flagsByStuId: Map<string, StudentFlag>
}>()

const emit = defineEmits<{
  select: [personId: number]
}>()

const query = ref('')
const onlyUngraded = ref(false)
const searchOpen = ref(false)

const visible = computed(() =>
  props.students.filter(
    (student) => (!onlyUngraded.value || student.score == null) && matchStudent(query.value, student),
  ),
)

const gradedCount = computed(() => props.students.filter((student) => student.score != null).length)

function toggleSearch() {
  if (searchOpen.value) query.value = ''
  searchOpen.value = !searchOpen.value
}

function flagLines(student: GradeStudent): string[] {
  const flag = student.userId ? props.flagsByStuId.get(student.userId) : undefined
  const lines: string[] = []
  if (flag?.focusReason != null) {
    const reason = flag.focusReason.trim()
    lines.push(reason ? `重点关注对象：${reason}` : '重点关注对象')
  }
  if (flag?.checkpoint) lines.push('领取了 Checkpoint')
  return lines
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="shrink-0 border-b border-line p-3">
      <div class="flex items-center gap-2">
        <div class="relative h-9 min-w-0 flex-1">
          <UButton
            v-if="!searchOpen"
            :variant="onlyUngraded ? 'soft' : 'outline'"
            :color="onlyUngraded ? 'primary' : 'neutral'"
            class="h-9 w-full justify-center"
            :aria-pressed="onlyUngraded"
            @click="onlyUngraded = !onlyUngraded"
          >
            只看未批改
          </UButton>
          <SearchInput
            v-else
            v-model="query"
            autofocus
            aria-label="搜索学生"
            placeholder="搜索"
          />
        </div>
        <UButton
          icon="i-lucide-search"
          square
          size="sm"
          color="neutral"
          variant="soft"
          class="h-9 w-9"
          :aria-label="searchOpen ? '关闭搜索' : '搜索'"
          @click="toggleSearch"
        />
        <UButton
          icon="i-lucide-sliders-horizontal"
          square
          size="sm"
          color="neutral"
          variant="soft"
          class="h-9 w-9"
          aria-label="筛选"
          disabled
        />
      </div>
      <div class="mt-2 flex items-center justify-between text-[11px] text-fg-subtle">
        <span>已提交 {{ props.students.length }} 人</span>
        <span class="tabular">
          已批改 <span class="font-semibold text-fg">{{ gradedCount }}</span> /
          {{ props.students.length }}
        </span>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-2">
      <p v-if="visible.length === 0" class="px-2 py-6 text-center text-xs text-fg-subtle">
        没有匹配的学生
      </p>
      <template v-else>
        <button
          v-for="student in visible"
          :key="student.personId"
          type="button"
          :class="
            cn(
              'mb-0.5 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors',
              student.personId === props.selectedPersonId
                ? 'bg-brand-500/10 text-fg'
                : 'hover:bg-sunken',
            )
          "
          @click="emit('select', student.personId)"
        >
          <span class="min-w-0 flex-1">
            <span class="flex min-w-0 items-center gap-1">
              <span class="min-w-0 truncate text-sm font-semibold">{{ student.name }}</span>
              <UTooltip
                v-if="flagLines(student).length > 0"
                :delay-duration="0"
                :content="{ side: 'right' }"
              >
                <span class="inline-flex shrink-0">
                  <UIcon
                    name="i-lucide-info"
                    class="size-[13px] text-fg-subtle transition-colors hover:text-brand-600 dark:hover:text-brand-300"
                  />
                </span>
                <template #content>
                  <span class="flex max-w-xs flex-col">
                    <span v-for="line in flagLines(student)" :key="line">{{ line }}</span>
                  </span>
                </template>
              </UTooltip>
            </span>
            <span class="tabular block text-[11px] text-fg-subtle">
              {{ student.studentId || `person ${student.personId}` }}
            </span>
            <span
              v-if="student.userId && (props.editorsByStuId.get(student.userId) ?? []).length > 0"
              class="mt-0.5 block truncate text-[11px] font-medium text-amber-600 dark:text-amber-400"
            >
              {{ (props.editorsByStuId.get(student.userId) ?? []).join('、') }} 正在批改
            </span>
          </span>
          <UBadge
            v-if="student.score != null"
            color="success"
            variant="soft"
            class="tabular inline-flex shrink-0 items-center gap-1 text-xs font-semibold"
          >
            <UIcon name="i-lucide-check" class="size-3 shrink-0" />
            {{ formatScore(student.score.score) }}
          </UBadge>
          <UBadge v-else color="neutral" variant="soft" class="shrink-0 text-[11px]">
            未批改
          </UBadge>
        </button>
      </template>
    </div>
  </div>
</template>
