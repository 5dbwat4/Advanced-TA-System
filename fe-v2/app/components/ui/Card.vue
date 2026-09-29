<script setup lang="ts">
/**
 * Card —— 逐字移植自 `fe/src/components/ui/Card.tsx` 的 `Card`（52 行文件里的上半部分）
 * 旧版的 `EmptyState` 已拆成独立文件 `EmptyState.vue`（见该文件），
 * 这样 FocusStudents 页面当年的 `EmptyState as HeroEmptyState` 导入别名就不需要了。
 *
 * 差异说明：
 *   - `motion.div` → `motion-v` 的 `motion.div`（同一引擎，props 一一对应）
 *   - `cn(...)` 与 className 合并逻辑逐字保留
 *   - `class` 透传：根元素是 motion 组件，Vue 会把父级的 class 合并进来
 *
 * prop：
 *   index —— 进场动画的 stagger 延迟（index * 0.06s）
 *   hover —— 额外的 hover 阴影
 */
import { motion } from 'motion-v'

import { cn } from '~/lib/utils'

/** ease: cubic-bezier(0.16, 1, 0.3, 1)（= main.css 里的 --ease-out-expo） */
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

const props = withDefaults(defineProps<{
  /** 进场动画的序号，用于错开延迟 */
  index?: number
  /** 是否带 hover 阴影 */
  hover?: boolean
}>(), {
  index: 0,
})
</script>

<template>
  <motion.div
    :initial="{ opacity: 0, y: 16 }"
    :animate="{ opacity: 1, y: 0 }"
    :transition="{ duration: 0.45, delay: props.index * 0.06, ease: EASE }"
    :class="cn(
      'rounded-2xl border border-line bg-elevated p-5',
      props.hover && 'transition-shadow hover:shadow-lg hover:shadow-brand-500/5',
    )"
  >
    <slot />
  </motion.div>
</template>
