<script setup lang="ts">
const logoSrc = `${import.meta.env.BASE_URL}favicon.svg`
</script>

<template>
  <div
    class="relative hidden flex-col justify-between overflow-hidden bg-brand-950 p-12 text-white lg:flex lg:h-full lg:w-[46%] lg:shrink-0"
  >
    <div
      class="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-500/30 blur-[100px]"
    />
    <div
      class="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-amber-500/20 blur-[100px]"
    />

    <div aria-hidden="true" class="circuit-lines pointer-events-none absolute inset-0 opacity-[0.13]" />

    <div class="brand-rise relative flex items-center gap-3">
      <img
        :src="logoSrc"
        width="44"
        height="44"
        alt=""
        aria-hidden="true"
        draggable="false"
        class="shrink-0 select-none"
      />
      <div>
        <div class="font-bold tracking-tight">计算机系统课程助教系统</div>
        <div class="text-xs uppercase tracking-[0.2em] text-white/50">Zhejiang University</div>
      </div>
    </div>

    <div class="relative">
      <h1
        class="brand-rise brand-rise-delay-1 text-4xl font-bold leading-tight tracking-tight xl:text-5xl"
      >
        Computer
        <br />
        Systems
      </h1>
      <p class="brand-rise brand-rise-delay-2 mt-4 max-w-md text-sm leading-relaxed text-white/60">
        计算机系统助教综合管理系统
      </p>
    </div>

    <div class="brand-rise brand-rise-delay-3 relative text-xs text-white/40">
      2025–2026 · 计算机系统助教综合管理系统
    </div>
  </div>
</template>

<style scoped>
.circuit-lines {
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.5) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.5) 1px, transparent 1px);
  background-size: 56px 56px;
  animation: circuit-drift 8s linear infinite;
}

.brand-rise {
  animation: brand-rise 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.brand-rise-delay-1 {
  animation-delay: 0.1s;
}

.brand-rise-delay-2 {
  animation-delay: 0.2s;
}

.brand-rise-delay-3 {
  animation-delay: 0.8s;
}

@keyframes circuit-drift {
  from {
    background-position: 0 0;
  }

  to {
    background-position: 56px 56px;
  }
}

@keyframes brand-rise {
  from {
    opacity: 0;
    transform: translateY(24px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
