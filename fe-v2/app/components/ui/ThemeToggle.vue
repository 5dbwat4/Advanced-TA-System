<script setup lang="ts">
/**
 * ThemeToggle —— 移植自 `fe/src/components/ui/ThemeToggle.tsx`（41 行）
 *
 * 变化点：
 *   1) `next-themes` 的 `useTheme()` → `@nuxtjs/color-mode` 的 `useColorMode()`
 *      （nuxt.config 已配 `classSuffix: ''` + `attribute: 'class'`，与 main.css 的
 *      `@custom-variant dark (&:is(.dark *))` 对得上；
 *      `preference` 初值是 `system`，`value` 是解析后的实际值）
 *   2) 旧版有个 `mounted` 标志是为了绕开 next-themes 的 SSR 水合不一致。
 *      本项目 `ssr: false`（SPA），**没有服务端渲染阶段**，所以这个标志不需要；
 *      同理 ThemeToggle 用的 `AnimatePresence :initial="false"` 已经保证首次
 *      渲染不播进场动画。
 *   3) 图标换成 `~icons/lucide/sun` / `~icons/lucide/moon`（unplugin-icons）。
 *      已核实这两个名字在 `@iconify-json/lucide` 里存在（MCP search-icons 命中
 *      `i-lucide-sun` / `i-lucide-moon`），也正是旧版引入的同两个图标。
 *   4) 类名 `text-fg-muted → hover:text-fg` + `hover:bg-sunken` 逐字保留。
 */
import { useColorMode } from '#imports'
import { AnimatePresence, motion } from 'motion-v'
import { computed } from 'vue'

import Moon from '~icons/lucide/moon'
import Sun from '~icons/lucide/sun'

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

function toggle() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}
</script>

<template>
  <button
    type="button"
    aria-label="切换主题"
    class="relative flex h-9 w-9 items-center justify-center rounded-xl text-fg-muted transition-colors hover:bg-sunken hover:text-fg"
    @click="toggle"
  >
    <AnimatePresence mode="wait" :initial="false">
      <motion.span
        :key="isDark ? 'moon' : 'sun'"
        :initial="{ opacity: 0, rotate: -90, y: 6 }"
        :animate="{ opacity: 1, rotate: 0, y: 0 }"
        :exit="{ opacity: 0, rotate: 90, y: -6 }"
        :transition="{ type: 'spring', stiffness: 380, damping: 26 }"
        class="flex"
      >
        <Moon v-if="isDark" :width="18" :height="18" class="shrink-0" />
        <Sun v-else :width="18" :height="18" class="shrink-0" />
      </motion.span>
    </AnimatePresence>
  </button>
</template>
