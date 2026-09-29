<script setup lang="ts">
/**
 * 登录页 —— 移植自 `fe/src/pages/Login.tsx`（11 行）
 * 左右分栏：左侧品牌面板（lg 起显示，LoginBrandPanel），右侧登录表单（LoginPanel）。
 * 走 default 布局（守卫外的公开页，不套 console 外壳）。
 */
definePageMeta({ layout: 'default' })
</script>

<template>
  <div class="flex min-h-screen">
    <LoginBrandPanel />
    <LoginPanel />
  </div>
</template>
