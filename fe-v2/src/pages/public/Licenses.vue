<script setup lang="ts">
import { useRouter } from 'vue-router'

import Card from '@/components/ui/Card.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { thirdPartyLicenses } from '@/lib/third-party'
import { UButton, UIcon } from '@/ui'

const router = useRouter()
</script>

<template>
  <div>
    <PageHeader title="Third Party Dependencies">
      <template #actions>
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-file-text"
          @click="router.push('/license/full')"
        >
          查看许可证全文
        </UButton>
      </template>
    </PageHeader>
    <Card :index="0" class="flex flex-col gap-2">
      <div
        v-for="item in thirdPartyLicenses"
        :key="`${item.name}@${item.version}`"
        class="flex flex-col gap-2 rounded-xl border border-line bg-sunken px-3 py-2.5"
      >
        <div class="flex items-center gap-3">
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-semibold">{{ item.name }}</div>
            <div class="tabular truncate text-xs text-fg-subtle">{{ item.version || '—' }}</div>
          </div>
          <span
            class="shrink-0 rounded-lg bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300"
          >
            {{ item.license }}
          </span>
        </div>
        <p v-if="item.description" class="line-clamp-2 text-xs text-fg-muted">
          {{ item.description }}
        </p>
        <div
          v-if="item.author || item.homepage"
          class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-subtle"
        >
          <span v-if="item.author" class="min-w-0 truncate">作者：{{ item.author }}</span>
          <a
            v-if="item.homepage"
            :href="item.homepage"
            target="_blank"
            rel="noreferrer"
            class="inline-flex min-w-0 items-center gap-1 transition-colors hover:text-fg-muted"
          >
            <UIcon name="i-lucide-external-link" class="size-3 shrink-0" />
            <span class="truncate">{{ item.homepage }}</span>
          </a>
        </div>
      </div>
    </Card>
  </div>
</template>
