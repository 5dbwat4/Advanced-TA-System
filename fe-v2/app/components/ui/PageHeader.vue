<script setup lang="ts">
/**
 * PageHeader —— 逐字移植自 `fe/src/components/ui/PageHeader.tsx`（24 行）
 *
 * ⚠️ API 变化（必读）：旧版右侧的按钮区是 **`actions` prop**（ReactNode），
 * Vue 里 JSX 表达式没法当 prop 传，**必须改成具名插槽 `#actions`**。
 *
 *   <!-- 旧 -->
 *   <PageHeader title="实验" actions={<Button …>新建实验</Button>} />
 *
 *   <!-- 新 -->
 *   <PageHeader title="实验">
 *     <template #actions>
 *       <AppButton size="lg" @press="creating = !creating">新建实验</AppButton>
 *     </template>
 *   </PageHeader>
 *
 * 不传 actions 时右侧容器不渲染（与旧版 `{actions && …}` 一致）。
 */
import { motion } from 'motion-v'

/** ease: cubic-bezier(0.16, 1, 0.3, 1)（= main.css 里的 --ease-out-expo） */
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

defineProps<{
  title: string
}>()
</script>

<template>
  <motion.div
    :initial="{ opacity: 0, y: 12 }"
    :animate="{ opacity: 1, y: 0 }"
    :transition="{ duration: 0.4, ease: EASE }"
    class="mb-6 flex flex-wrap items-end justify-between gap-4"
  >
    <div>
      <h1 class="text-2xl font-bold tracking-tight md:text-3xl">{{ title }}</h1>
    </div>
    <div v-if="$slots.actions" class="flex items-center gap-2">
      <slot name="actions" />
    </div>
  </motion.div>
</template>
