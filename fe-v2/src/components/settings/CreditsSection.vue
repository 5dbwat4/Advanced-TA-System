<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import Card from '@/components/ui/Card.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import { formatDateTime } from '@/lib/format'
import { UButton, UIcon } from '@/ui'

const props = withDefaults(
  defineProps<{
    index?: number
  }>(),
  {
    index: 0,
  },
)

const OWNER = '5dbwat4'
const REPO = 'Advanced-TA-System'
const REPO_URL = `https://github.com/${OWNER}/${REPO}`
const STATS_CACHE_KEY = 'ta-console:credits:repo-stats'
const STATS_TTL = 60 * 60 * 1000

type RepoStats = { stars: number; forks: number }

function readCachedStats(): RepoStats | null {
  try {
    const raw = localStorage.getItem(STATS_CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as { at?: unknown; stars?: unknown; forks?: unknown }
    if (
      typeof cached.at !== 'number' ||
      typeof cached.stars !== 'number' ||
      typeof cached.forks !== 'number' ||
      Date.now() - cached.at > STATS_TTL
    ) {
      return null
    }
    return { stars: cached.stars, forks: cached.forks }
  } catch {
    return null
  }
}

const stats = ref<RepoStats | null>(readCachedStats())
const router = useRouter()
const buildHash = __BUILD_HASH__
const buildTime = formatDateTime(__BUILD_TIME__)
let cancelled = false

onMounted(() => {
  if (readCachedStats()) return
  fetch(`https://api.github.com/repos/${OWNER}/${REPO}`)
    .then((response) => (response.ok ? response.json() : null))
    .then((data: { stargazers_count?: number; forks_count?: number } | null) => {
      if (cancelled || !data) return
      const next = { stars: data.stargazers_count ?? 0, forks: data.forks_count ?? 0 }
      stats.value = next
      try {
        localStorage.setItem(STATS_CACHE_KEY, JSON.stringify({ at: Date.now(), ...next }))
      } catch {
        // storage unavailable 鈥?keep in-memory only
      }
    })
    .catch(() => undefined)
})

onUnmounted(() => {
  cancelled = true
})

function openChangelog() {
  void router.push('/changelog')
}
</script>

<template>
  <Card :index="props.index" class="flex flex-col gap-4">
    <SectionHeader icon="i-lucide-sparkles">Credits</SectionHeader>

    <div class="flex items-center justify-between gap-3 rounded-xl border border-line bg-sunken px-4 py-3">
      <span class="text-sm font-semibold text-fg">A 5dbwat4 Product</span>
      <a
        :href="`https://github.com/${OWNER}`"
        target="_blank"
        rel="noreferrer"
        class="flex shrink-0 items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
      >
        <UIcon name="i-lucide-github" class="h-3.5 w-3.5 shrink-0" />@{{ OWNER }}
      </a>
    </div>

    <div class="flex flex-col gap-3 rounded-xl border border-line bg-sunken px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex min-w-0 flex-col items-start gap-1.5 text-xs text-fg-muted">
        <div class="tabular">
          Current build <span class="font-semibold text-fg">{{ buildHash }}</span>
        </div>
        <div class="tabular">Build time {{ buildTime }}</div>
        <UButton size="sm" color="neutral" variant="soft" @click="openChangelog">
          <UIcon name="i-lucide-history" class="h-3.5 w-3.5 shrink-0" />
          View changelog
        </UButton>
      </div>
      <div class="flex shrink-0 flex-col gap-1.5 sm:items-end">
        <a
          :href="REPO_URL"
          target="_blank"
          rel="noreferrer"
          class="flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
        >
          <UIcon name="i-lucide-github" class="h-3.5 w-3.5 shrink-0" />
          {{ OWNER }}/{{ REPO }}
        </a>
        <div class="flex items-center gap-3 text-xs text-fg-subtle">
          <span class="flex items-center gap-1">
            <UIcon name="i-lucide-star" class="h-3 w-3 shrink-0" />
            {{ stats ? stats.stars : '鈥? }}
          </span>
          <span class="flex items-center gap-1">
            <UIcon name="i-lucide-git-fork" class="h-3 w-3 shrink-0" />
            {{ stats ? stats.forks : '鈥? }}
          </span>
        </div>
      </div>
    </div>

    <RouterLink
      to="/license"
      class="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-sunken px-4 py-3 text-left transition-colors hover:border-brand-500/40"
    >
      <span class="flex items-center gap-2 text-sm font-semibold text-fg">
        <UIcon name="i-lucide-package" class="h-4 w-4 shrink-0 text-fg-muted" />
        third party licenses
      </span>
      <UIcon name="i-lucide-chevron-right" class="h-4.5 w-4.5 shrink-0 text-fg-subtle" />
    </RouterLink>
  </Card>
</template>
