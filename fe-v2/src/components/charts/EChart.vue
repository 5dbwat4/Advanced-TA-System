<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { CustomChart, ScatterChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import type { ECharts, EChartsCoreOption } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { onMounted, onUnmounted, ref, watch } from 'vue'

echarts.use([
  CustomChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkLineComponent,
  LegendComponent,
  CanvasRenderer,
])

const props = withDefaults(
  defineProps<{
    option: EChartsOption
    height?: number
    class?: string
    onEvents?: Record<string, (params: unknown) => void>
  }>(),
  {
    height: 320,
  },
)

const el = ref<HTMLDivElement | null>(null)
let chart: ECharts | null = null
let observer: ResizeObserver | null = null
let boundEvents: Record<string, (params: unknown) => void> = {}

function applyOption() {
  chart?.setOption(props.option as EChartsCoreOption, true)
}

function bindEvents() {
  if (!chart) return

  for (const [name, handler] of Object.entries(boundEvents)) {
    chart.off(name, handler)
  }
  boundEvents = {}

  for (const [name, handler] of Object.entries(props.onEvents ?? {})) {
    const wrapped = (params: unknown) => handler(params)
    chart.on(name, wrapped)
    boundEvents[name] = wrapped
  }
}

onMounted(() => {
  if (!el.value) return

  chart = echarts.init(el.value, undefined, { renderer: 'canvas' })
  applyOption()
  bindEvents()

  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(el.value)
})

watch(
  () => props.option,
  () => applyOption(),
  { deep: true },
)

watch(
  () => props.onEvents,
  () => bindEvents(),
  { deep: true },
)

onUnmounted(() => {
  observer?.disconnect()
  observer = null
  chart?.dispose()
  chart = null
  boundEvents = {}
})
</script>

<template>
  <div ref="el" :class="props.class" :style="{ height: `${props.height}px`, width: '100%' }" />
</template>
