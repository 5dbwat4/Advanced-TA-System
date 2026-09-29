<script setup lang="ts">
// 公开页：用 default 布局，不套 console 外壳
definePageMeta({ layout: 'default' })

// 登录成功后回跳的原始路径，由 auth.global.ts 以 ?redirect= 传入
const route = useRoute()
const redirect = computed(() => {
  const raw = route.query.redirect
  return typeof raw === 'string' ? raw : ''
})
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center px-6">
    <div class="w-full max-w-sm rounded-2xl border border-line bg-elevated p-8 text-center">
      <h1 class="text-lg font-semibold text-fg">登录</h1>
      <p class="mt-1 text-sm text-fg-muted">空壳页，密码 / 通行密钥登录待迁移（Phase B）。</p>
      <p v-if="redirect" class="mt-3 break-all text-xs text-fg-subtle">
        登录后将返回 {{ redirect }}
      </p>
    </div>
  </div>
</template>
