<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import Card from '@/components/ui/Card.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { NAV_ITEMS, isNavItemActive } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { UIcon } from '@/ui'

const route = useRoute()

const items = computed(() => NAV_ITEMS)
</script>

<template>
  <div class="mx-auto max-w-2xl">
    <PageHeader title="更多" />

    <Card :index="0" class="p-2 sm:p-3">
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <RouterLink
          v-for="item in items"
          :key="item.to"
          :to="item.to"
          :class="
            cn(
              'flex items-center gap-3 rounded-xl px-3 py-3 transition-colors',
              isNavItemActive(item, route.path)
                ? 'bg-brand-500/10 ring-1 ring-brand-500/25'
                : 'hover:bg-sunken/60',
            )
          "
        >
          <span
            :class="
              cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                isNavItemActive(item, route.path)
                  ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/25'
                  : 'bg-gradient-to-br from-brand-500/15 to-amber-500/10 text-brand-600 dark:text-brand-300',
              )
            "
          >
            <UIcon :name="item.icon" class="h-[18px] w-[18px] shrink-0" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span
              :class="
                cn(
                  'text-sm font-semibold',
                  isNavItemActive(item, route.path)
                    ? 'text-brand-600 dark:text-brand-300'
                    : 'text-fg',
                )
              "
            >
              {{ item.label }}
            </span>
            <span class="truncate text-xs text-fg-subtle">{{ item.description }}</span>
          </span>
          <UIcon name="i-lucide-chevron-right" class="ms-auto h-4 w-4 shrink-0 text-fg-subtle" />
        </RouterLink>
      </div>
    </Card>
  </div>
</template>
