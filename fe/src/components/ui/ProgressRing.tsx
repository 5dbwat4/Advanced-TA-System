import { motion, useSpring, useTransform } from 'motion/react'
import { useEffect } from 'react'

export function ProgressRing({
  value,
  size = 76,
  stroke = 7,
}: {
  value: number
  size?: number
  stroke?: number
}) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(1, value))

  const progress = useSpring(0, { stiffness: 60, damping: 18 })
  useEffect(() => {
    progress.set(clamped)
  }, [clamped, progress])

  const dashoffset = useTransform(progress, (v) => circumference * (1 - v))

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--bg-sunken)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#progress-ring-gradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: dashoffset }}
        />
        <defs>
          <linearGradient id="progress-ring-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand-500)" />
            <stop offset="100%" stopColor="var(--amber-500)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="tabular text-sm font-bold">{Math.round(clamped * 100)}%</span>
      </div>
    </div>
  )
}
