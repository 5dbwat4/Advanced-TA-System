<template>
  <!--
    AppShell 将在 Phase A3 完整实现（← fe/src/components/layout/AppShell.tsx）：
    桌面侧栏 + .glass 顶栏 + 移动端底部导航 + 导航激活块的 motion-v layout-id 滑动。
    本批只提供最小可用容器，保证 /console/* 能渲染占位页。
  -->
  <div class="min-h-dvh">
    <slot />
  </div>
</template>
