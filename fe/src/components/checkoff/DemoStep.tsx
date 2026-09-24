import { Button } from '@heroui/react'
import { motion } from 'motion/react'

import { Icon } from '@/components/ui/Icon'

export function DemoStep({ onNext }: { onNext: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-line bg-elevated p-10 text-center"
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30">
        <Icon icon="lucide:monitor-play" width={26} />
      </div>
      <div className="mt-4 text-lg font-bold text-fg">请展示 demo</div>
      <div className="mt-1 text-sm text-fg-subtle">代码 / 上板结果 / 仿真结果等</div>
      <div className="mt-6 flex justify-center">
        <Button
          size="lg"
          onPress={onNext}
          className="bg-gradient-to-r from-brand-600 to-brand-700 shadow-lg shadow-brand-600/25"
        >
          下一步
          <Icon icon="lucide:arrow-right" width={16} />
        </Button>
      </div>
    </motion.div>
  )
}
