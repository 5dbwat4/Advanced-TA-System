<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import CheckinScreen from '@/components/checkin/CheckinScreen.vue'

const route = useRoute()
const router = useRouter()

const token = computed(() => {
  const value = route.params.token
  return typeof value === 'string' ? value : undefined
})

function goBack() {
  void router.push('/checkin')
}
</script>

<template>
  <CheckinScreen :token="token" @back="goBack" />
</template>
