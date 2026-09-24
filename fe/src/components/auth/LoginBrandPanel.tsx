import { motion } from 'motion/react'

import Cpu from '~icons/lucide/cpu'

/** Left branding panel of the login page (desktop only). */
export function LoginBrandPanel() {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-950 p-12 text-white lg:flex lg:w-[46%]">
      {/* decorative glows */}
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-500/30 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-amber-500/20 blur-[100px]" />

      {/* animated circuit lines */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.13]"
        initial={{ backgroundPosition: '0 0' }}
        animate={{ backgroundPosition: '56px 56px' }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex items-center gap-3"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
          <Cpu width={24} height={24} className="shrink-0" />
        </div>
        <div>
          <div className="font-bold tracking-tight">CS-II 助教系统</div>
          <div className="text-xs uppercase tracking-[0.2em] text-white/50">Zhejiang University</div>
        </div>
      </motion.div>

      <div className="relative">
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-4xl font-bold leading-tight tracking-tight xl:text-5xl"
        >
          Computer
          <br />
          Systems{' '}
          <span className="bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">
            II
          </span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 max-w-md text-sm leading-relaxed text-white/60"
        >
          计算机系统 II 助教综合管理系统
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-10 flex flex-wrap gap-2"
        >
          {['Checkoff', 'FPGA Boards', 'Grading', 'Passkey'].map((label, i) => (
            <motion.span
              key={label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 + i * 0.08, type: 'spring', stiffness: 300, damping: 20 }}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/70 backdrop-blur"
            >
              {label}
            </motion.span>
          ))}
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.8 }}
        className="relative text-xs text-white/40"
      >
        2025–2026 · 计算机系统 II 助教综合管理系统
      </motion.div>
    </div>
  )
}
