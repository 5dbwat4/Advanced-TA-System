<script setup lang="ts">
import { avatarSprite, type AvatarSprite } from 'avatars'
import { computed } from 'vue'

import type { CheckoffPerson } from '@/lib/checkoff-socket'

const props = defineProps<{
  grader: CheckoffPerson
  student: CheckoffPerson | null
}>()

function avatarStyle(sprite: AvatarSprite, size: number) {
  return {
    width: `${size}px`,
    height: `${size}px`,
    backgroundImage: `url("${sprite.atlas}")`,
    backgroundSize: `${size * sprite.columns}px ${size * sprite.rows}px`,
    backgroundPosition: `-${sprite.col * size}px -${sprite.row * size}px`,
  }
}

const people = computed(() =>
  [
    { label: '验收人', person: props.grader },
    { label: '被验收人', person: props.student },
  ].map(({ label, person }) => ({
    label,
    name: person?.name.trim() || '未选择',
    sprite: avatarSprite(person?.avatar ?? null),
  })),
)
</script>

<template>
  <div
    class="mb-3 flex items-center gap-3 rounded-2xl border border-line bg-elevated/70 px-4 py-2.5 shadow-lg backdrop-blur-xl"
  >
    <template v-for="(person, index) in people" :key="person.label">
      <div v-if="index > 0" class="h-8 w-px shrink-0 bg-line" />
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <div
          v-if="person.sprite"
          role="img"
          :aria-label="person.sprite.name"
          class="shrink-0 rounded-full bg-no-repeat"
          :style="avatarStyle(person.sprite, 28)"
        />
        <div
          v-else
          aria-hidden="true"
          class="flex shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-sm font-bold text-amber-600 dark:text-amber-400"
          :style="{ width: '28px', height: '28px' }"
        >
          {{ person.name.slice(0, 1) }}
        </div>
        <div class="min-w-0">
          <div class="text-[10px] font-semibold uppercase tracking-widest text-fg-subtle">
            {{ person.label }}
          </div>
          <div class="truncate text-sm font-semibold text-fg">{{ person.name }}</div>
        </div>
      </div>
    </template>
  </div>
</template>
