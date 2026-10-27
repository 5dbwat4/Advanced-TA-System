<script setup lang="ts">
import { ref } from 'vue'

import Card from '@/components/ui/Card.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { cn } from '@/lib/utils'
import { UIcon } from '@/ui'

const entries = __BUILD_CHANGELOG__
const expanded = ref<string[]>([])

function toggle(hash: string) {
  expanded.value = expanded.value.includes(hash)
    ? expanded.value.filter((item) => item !== hash)
    : [...expanded.value, hash]
}
</script>

<template>
  <div>
    <PageHeader title="Changelog" />
    <Card :index="0" class="flex flex-col gap-2">
      <div
        v-if="entries.length === 0"
        class="rounded-xl border border-dashed border-line py-10 text-center text-xs text-fg-subtle"
      >
        无法读取提交记录
      </div>
      <template v-else>
        <button
          v-for="entry in entries"
          :key="entry.hash"
          type="button"
          :class="
            cn(
              'flex w-full flex-col gap-2 rounded-xl border border-line bg-sunken px-3 py-2.5 text-left',
              entry.body.length > 0 && 'transition-colors hover:border-brand-500/40',
            )
          "
          @click="entry.body.length > 0 && toggle(entry.hash)"
        >
          <span class="flex w-full items-center gap-3">
            <span
              class="tabular shrink-0 rounded-lg bg-elevated px-2 py-0.5 text-[11px] font-semibold text-fg-muted"
            >
              {{ entry.hash }}
            </span>
            <span class="tabular shrink-0 text-[11px] text-fg-subtle">{{ entry.date }}</span>
            <span class="min-w-0 flex-1 truncate text-xs text-fg-muted">{{ entry.subject }}</span>
            <UIcon
              v-if="entry.body.length > 0"
              name="i-lucide-chevron-down"
              :class="
                cn(
                  'size-3.5 shrink-0 text-fg-subtle transition-transform',
                  expanded.includes(entry.hash) && 'rotate-180',
                )
              "
            />
          </span>
          <span
            v-if="expanded.includes(entry.hash)"
            class="w-full whitespace-pre-wrap border-t border-line pt-2 font-mono text-xs leading-relaxed text-fg-muted"
          >
            {{ entry.body }}
          </span>
        </button>
      </template>
    </Card>
  </div>
</template>
