<script setup lang="ts">
import { avatarSprite } from 'avatars'
import 'github-markdown-css/github-markdown.css'
import MarkdownIt from 'markdown-it'
import { computed, defineComponent, h, type PropType } from 'vue'

import { UIcon } from '@/ui'
import type { MarkdownStyleId } from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import type { SlaveCardState } from '@/lib/checkoff-socket'
import { cn } from '@/lib/utils'

const props = defineProps<{
  state: SlaveCardState
  markdownStyle?: MarkdownStyleId
}>()

const auth = useAuthStore()
const md = new MarkdownIt({ html: false, linkify: true })

const resolvedStyle = computed<MarkdownStyleId>(
  () => props.markdownStyle ?? auth.user?.preferences?.markdownStyle ?? 'github',
)

const markdownClass = computed(() =>
  resolvedStyle.value === 'prose' ? 'prose dark:prose-invert max-w-none' : 'markdown-body',
)

function renderMarkdown(source: string): string {
  return md.render(source)
}

const cardKey = computed(() => {
  const state = props.state
  if (state.kind === 'ask_question') {
    return `q-${state.index}-${state.content.slice(0, 8)}`
  }
  if (state.kind === 'custom_card') {
    return `custom-${state.title}-${state.content.slice(0, 8)}`
  }
  return state.kind
})

const isHero = computed(() => props.state.kind === 'idle' || props.state.kind === 'thank')

const AvatarImage = defineComponent({
  name: 'AvatarImage',
  props: {
    id: { type: Number as PropType<number | null>, default: null },
    size: { type: Number, required: true },
    fallback: { type: String, required: true },
  },
  setup(avatarProps) {
    const sprite = computed(() => avatarSprite(avatarProps.id))

    return () => {
      const size = avatarProps.size
      const style = sprite.value
        ? {
            width: `${size}px`,
            height: `${size}px`,
            backgroundImage: `url("${sprite.value.atlas}")`,
            backgroundSize: `${size * sprite.value.columns}px ${size * sprite.value.rows}px`,
            backgroundPosition: `-${sprite.value.col * size}px -${sprite.value.row * size}px`,
          }
        : { width: `${size}px`, height: `${size}px` }

      if (sprite.value) {
        return h('div', {
          role: 'img',
          'aria-label': sprite.value.name,
          class: 'shrink-0 rounded-full bg-no-repeat',
          style,
        })
      }

      return h(
        'div',
        {
          'aria-hidden': 'true',
          class:
            'flex shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-sm font-bold text-amber-600 dark:text-amber-400',
          style,
        },
        avatarProps.fallback,
      )
    }
  },
})
</script>

<template>
  <Transition name="slave-card" mode="out-in">
    <div
      :key="cardKey"
      :class="
        cn(
          'rounded-3xl border border-line bg-elevated/80 p-8 shadow-2xl backdrop-blur-xl transition-shadow duration-300 hover:shadow-2xl hover:shadow-brand-600/20',
          isHero && 'flex aspect-square w-full items-center justify-center',
        )
      "
    >
      <div v-if="state.kind === 'idle'" class="flex flex-col items-center gap-6 text-center">
        <div
          class="flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-brand-600/10 text-brand-600 dark:text-brand-300"
        >
          <UIcon name="i-lucide-cpu" class="size-[30px] shrink-0" />
        </div>
        <div class="text-4xl font-bold tracking-tight text-fg md:text-5xl">此处可验收</div>
        <div v-if="state.experimentMark.length > 0" class="text-sm text-fg-subtle">
          Lab {{ state.experimentMark }} · {{ state.experimentTitle }}
        </div>
      </div>

      <div
        v-else-if="state.kind === 'ask_name'"
        class="flex flex-col items-center gap-2 text-center"
      >
        <div class="text-3xl font-bold tracking-tight text-fg md:text-4xl">
          您的姓名 / 学号？
        </div>
        <div class="text-sm text-fg-subtle">请告诉助教</div>
      </div>

      <div
        v-else-if="state.kind === 'ask_demo'"
        class="flex flex-col items-center gap-2 text-center"
      >
        <div class="text-3xl font-bold tracking-tight text-fg md:text-4xl">请展示 demo</div>
        <div class="text-sm text-fg-subtle">代码 / 上板结果 / 仿真结果等</div>
      </div>

      <div v-else-if="state.kind === 'custom_card'">
        <div v-if="state.title.trim()" class="mb-4 text-2xl font-bold tracking-tight text-fg">
          {{ state.title }}
        </div>
        <div :class="markdownClass" v-html="renderMarkdown(state.content)" />
      </div>

      <div v-else-if="state.kind === 'ask_question'">
        <div class="mb-4 flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <AvatarImage
              :id="state.studentAvatar"
              :size="36"
              :fallback="state.studentName.slice(0, 1)"
            />
            <span class="text-sm font-semibold text-fg">{{ state.studentName }}</span>
          </div>
          <div class="text-right">
            <div class="tabular text-[11px] uppercase tracking-widest text-fg-subtle">
              问题 {{ state.index }} / {{ state.total }}
            </div>
            <div class="mt-0.5 flex items-center justify-end gap-1.5 text-[11px] text-fg-subtle">
              <span>命题人</span>
              <AvatarImage
                :id="state.questionAuthorAvatar"
                :size="18"
                :fallback="(state.questionAuthor || '未知').slice(0, 1)"
              />
              <span>{{ state.questionAuthor || '未知' }}</span>
            </div>
          </div>
        </div>
        <div :class="markdownClass" v-html="renderMarkdown(state.content)" />
      </div>

      <div
        v-else-if="state.kind === 'thank'"
        class="flex flex-col items-center gap-2 text-center"
      >
        <div class="text-3xl font-bold tracking-tight text-fg md:text-4xl">
          感谢您参与验收
        </div>
        <div v-if="state.studentName" class="text-sm text-fg-subtle">
          {{ state.studentName }}
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slave-card-enter-active,
.slave-card-leave-active {
  transition:
    opacity 0.32s ease,
    transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.slave-card-enter-from {
  opacity: 0;
  transform: translateX(120px) scale(0.9);
}

.slave-card-leave-to {
  opacity: 0;
  transform: translateX(-120px) scale(0.9);
}
</style>
