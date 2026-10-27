<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import SetQuestionsEditor from '@/components/questions/SetQuestionsEditor.vue'
import BackLink from '@/components/ui/BackLink.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { listBanks } from '@/lib/api'
import { useAsyncData } from '@/lib/request'
import { USkeleton } from '@/ui'

const route = useRoute()
const router = useRouter()

const id = computed(() => String(route.params.id ?? ''))

const { data: bank, loading } = useAsyncData(async () => {
  if (!id.value) return null
  const { banks } = await listBanks()
  return banks.find((item) => item.id === id.value) ?? null
}, [id])

function backTo() {
  return id.value ? `/console/questions/banks/${id.value}` : '/console/questions?tab=sets'
}

function onSaved() {
  if (bank.value) void router.push(`/console/questions/banks/${bank.value.id}`)
}
</script>

<template>
  <div class="w-full">
    <BackLink :to="backTo()">返回题目集</BackLink>

    <PageHeader :title="bank ? `管理题目 · ${bank.name}` : '管理题目'" />

    <USkeleton v-if="loading" class="h-64 rounded-2xl" />
    <EmptyState
      v-else-if="!bank"
      icon="i-lucide-notebook-text"
      title="题目集不存在"
      hint="它可能已被删除"
    />
    <div v-else class="rounded-2xl border border-line bg-elevated p-6">
      <SetQuestionsEditor :bank="bank" @saved="onSaved" />
    </div>
  </div>
</template>
