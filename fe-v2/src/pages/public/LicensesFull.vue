<script setup lang="ts">
import Card from '@/components/ui/Card.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { licenseEntryText, thirdPartyLicenses } from '@/lib/third-party'

const SEPARATOR = `\n\n${'='.repeat(80)}\n\n`
</script>

<template>
  <div>
    <PageHeader title="Third Party Licenses" />
    <Card :index="0" class="flex flex-col">
      <pre
        v-for="(item, index) in thirdPartyLicenses"
        :key="`${item.name}@${item.version}`"
        class="whitespace-pre-wrap font-mono text-[11px] leading-5 text-fg-muted"
      >{{ index === 0 ? licenseEntryText(item) : `${SEPARATOR}${licenseEntryText(item)}` }}</pre>
    </Card>
  </div>
</template>
