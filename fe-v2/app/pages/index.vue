<script setup lang="ts">
// 旧版 App.tsx 里 `<Route path="/" element={<Navigate to="/console" replace />} />`
definePageMeta({ layout: false })

await navigateTo('/console', { replace: true })
</script>
