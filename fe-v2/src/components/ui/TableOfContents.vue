<script lang="ts">
export type TocItem = { id: string; label: string }
</script>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { cn } from '@/lib/utils'

const props = defineProps<{
  items: TocItem[]
}>()

const activeId = ref<string | null>(props.items[0]?.id ?? null)
const router = useRouter()
let observer: IntersectionObserver | null = null

function setupObserver() {
  if (typeof window === 'undefined') return
  observer?.disconnect()

  const sections = props.items
    .map((item) => document.getElementById(item.id))
    .filter((element): element is HTMLElement => element !== null)
  if (sections.length === 0) return

  if (!sections.some((section) => section.id === activeId.value)) {
    activeId.value = sections[0].id
  }

  const offset = 96
  observer = new IntersectionObserver(
    () => {
      let current = sections[0].id
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= offset) current = section.id
      }
      activeId.value = current
    },
    { rootMargin: `-${offset}px 0px -55% 0px`, threshold: [0, 1] },
  )

  sections.forEach((section) => observer?.observe(section))
}

function goTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  void router.push({ hash: `#${id}` })
}

onMounted(setupObserver)
watch(() => props.items, setupObserver)
onUnmounted(() => observer?.disconnect())
</script>

<template>
  <nav class="sticky top-24 hidden w-44 shrink-0 lg:block" aria-label="本页目录">
    <p class="mb-3 pl-4 text-xs font-bold">本页目录</p>
    <ul>
      <li v-for="item in props.items" :key="item.id">
        <a
          :href="`#${item.id}`"
          :class="
            cn(
              'block border-l-2 py-1.5 pl-4 text-sm transition-colors',
              activeId === item.id
                ? 'border-brand-500 font-semibold text-brand-600 dark:text-brand-300'
                : 'border-line text-fg-muted hover:text-fg',
            )
          "
          @click.prevent="goTo(item.id)"
        >
          {{ item.label }}
        </a>
      </li>
    </ul>
  </nav>
</template>
