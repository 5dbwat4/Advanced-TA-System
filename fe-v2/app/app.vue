<template>
  <!-- Nuxt UI v4：UApp 提供 Toast / Tooltip / Overlay 的全局出口（useToast、useOverlayState 都依赖它） -->
  <UApp :toaster="{ position: 'bottom-right' }">
    <!-- 全局环境光与网格装饰（照搬 fe/src/main.tsx 的用法） -->
    <div class="aurora" aria-hidden="true" />
    <div class="grid-overlay" aria-hidden="true" />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
