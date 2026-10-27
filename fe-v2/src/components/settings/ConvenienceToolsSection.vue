<script setup lang="ts">
import { useRouter } from 'vue-router'

import Card from '@/components/ui/Card.vue'
import SectionHeader from '@/components/ui/SectionHeader.vue'
import { UButton, UIcon, UTooltip } from '@/ui'

defineProps<{
  index: number
}>()

const router = useRouter()

function goSyncScores() {
  void router.push('/console/courses/sync-scores')
}
</script>

<template>
  <Card :index="index">
    <SectionHeader icon="i-lucide-wrench">便捷工具</SectionHeader>

    <div class="mt-4">
      <UTooltip
        text="适用于先前已在使用学在浙大管理成绩的情况，快捷同步已存在于学在浙大的旧数据。"
        :content="{ side: 'bottom' }"
      >
        <UButton block color="neutral" variant="soft" class="justify-start" @click="goSyncScores">
          <UIcon name="i-lucide-refresh-cw" class="h-4 w-4 shrink-0" />
          从学在浙大同步成绩
        </UButton>
      </UTooltip>
    </div>
  </Card>
</template>