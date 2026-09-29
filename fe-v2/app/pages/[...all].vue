<script setup lang="ts">
// 旧版 App.tsx 里的 `<Route path="*" element={<Navigate to="/console" replace />} />`
// 验收点 ④：未知路径回落 /console（守卫跑在重定向之前，未登录时仍会先被弹去 /login）
definePageMeta({ layout: false })

await navigateTo('/console', { replace: true })
</script>
