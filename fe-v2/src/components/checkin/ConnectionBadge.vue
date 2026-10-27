<script setup lang="ts">
import { UBadge, UIcon } from '@/ui'
import { useCheckoffConnection } from '@/lib/checkoff-socket'

const online = useCheckoffConnection()
</script>

<template>
  <UBadge
    role="status"
    :color="online ? 'success' : 'neutral'"
    variant="soft"
    size="sm"
    class="pointer-events-none absolute right-5 top-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold shadow-sm backdrop-blur"
  >
    <UIcon
      :name="online ? 'i-lucide-wifi' : 'i-lucide-wifi-off'"
      class="size-[13px] shrink-0"
    />
    {{ online ? 'Connected' : 'Disconnected' }}
  </UBadge>
</template>
