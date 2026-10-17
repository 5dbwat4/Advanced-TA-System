import { CustomChart, ScatterChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import type { EChartsCoreOption } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import ReactEChartsCore from 'echarts-for-react/lib/core'

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

export function EChart({
  option,
  height = 320,
  className,
  onEvents,
}: {
  option: EChartsCoreOption
  height?: number
  className?: string
  onEvents?: Record<string, (params: any) => void>
}) {
  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      style={{ height }}
      opts={{ renderer: 'canvas' }}
      onEvents={onEvents}
      notMerge
      lazyUpdate
      className={className}
    />
  )
}
