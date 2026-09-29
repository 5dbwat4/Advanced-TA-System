<script setup lang="ts">
/**
 * LoginBrandPanel —— 移植自 `fe/src/components/auth/LoginBrandPanel.tsx`（76 行）
 *
 * 登录页左侧品牌面板（仅 lg 及以上显示）。
 *
 * ────────────────────────────────────────────────────────────────────────
 * 动效（§4.4-C，登录页的招牌动效）
 * ────────────────────────────────────────────────────────────────────────
 * 1) **电路网格无限循环漂移**（:19）：`initial={{ backgroundPosition: '0 0' }}` →
 *    `animate={{ backgroundPosition: '56px 56px' }}`，
 *    `transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}`。
 *    源文件用的是「无限重复的单次动画」而不是 variants + AnimatePresence（后者
 *    用于进场元素的编排），这里逐字照搬 source of truth：repeat: Infinity 即
 *    无限循环漂移，不能简化成静态渐变。
 * 2) 其余 4 处是入场 stagger（opacity / y 位移 + easeOutExpo 曲线），
 *    曲线 [0.16, 1, 0.3, 1] 与 main.css 的 --ease-out-expo 相同。
 */
import { motion } from 'motion-v'

import Cpu from '~icons/lucide/cpu'

/** ease: cubic-bezier(0.16, 1, 0.3, 1)（= main.css 里的 --ease-out-expo） */
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

/** 电路网格的两层 1px 线性渐变（源文件写在 style 里） */
const GRID_STYLE = {
  backgroundImage:
    'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
  backgroundSize: '56px 56px',
}
</script>

<template>
  <div class="relative hidden flex-col justify-between overflow-hidden bg-brand-950 p-12 text-white lg:flex lg:w-[46%]">
    <!-- decorative glows -->
    <div class="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-500/30 blur-[100px]" />
    <div class="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-amber-500/20 blur-[100px]" />

    <!-- animated circuit lines（8s 无限循环漂移） -->
    <motion.div
      aria-hidden
      class="pointer-events-none absolute inset-0 opacity-[0.13]"
      :style="GRID_STYLE"
      :initial="{ backgroundPosition: '0 0' }"
      :animate="{ backgroundPosition: '56px 56px' }"
      :transition="{ duration: 8, repeat: Infinity, ease: 'linear' }"
    />

    <motion.div
      :initial="{ opacity: 0, y: 16 }"
      :animate="{ opacity: 1, y: 0 }"
      :transition="{ duration: 0.6, ease: EASE }"
      class="relative flex items-center gap-3"
    >
      <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
        <Cpu :width="24" :height="24" class="shrink-0" />
      </div>
      <div>
        <div class="font-bold tracking-tight">CS-II 助教系统</div>
        <div class="text-xs uppercase tracking-[0.2em] text-white/50">Zhejiang University</div>
      </div>
    </motion.div>

    <div class="relative">
      <motion.h1
        :initial="{ opacity: 0, y: 24 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.7, delay: 0.1, ease: EASE }"
        class="text-4xl font-bold leading-tight tracking-tight xl:text-5xl"
      >
        Computer
        <br />
        Systems
        <span class="bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">
          II
        </span>
      </motion.h1>
      <motion.p
        :initial="{ opacity: 0, y: 24 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.7, delay: 0.2, ease: EASE }"
        class="mt-4 max-w-md text-sm leading-relaxed text-white/60"
      >
        计算机系统 II 助教综合管理系统
      </motion.p>
    </div>

    <motion.div
      :initial="{ opacity: 0 }"
      :animate="{ opacity: 1 }"
      :transition="{ delay: 0.8, duration: 0.8 }"
      class="relative text-xs text-white/40"
    >
      2025–2026 · 计算机系统 II 助教综合管理系统
    </motion.div>
  </div>
</template>
