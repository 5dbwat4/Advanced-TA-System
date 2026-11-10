import { Button } from '@heroui/react'
import type { ReactNode } from 'react'

import ShoppingCart from '~icons/lucide/shopping-cart'
import { useQuestionBasket, type BasketQuestion } from '@/lib/question-basket'
import { cn } from '@/lib/utils'

export function AddToBasketButton({ question }: { question: BasketQuestion }) {
  const added = useQuestionBasket((state) =>
    state.items.some((item) => item.id === question.id),
  )
  const toggle = useQuestionBasket((state) => state.toggle)

  return (
    <Button size="sm" variant={added ? 'secondary' : 'primary'} onPress={() => toggle(question)}>
      <ShoppingCart width={14} height={14} className="shrink-0" />
      {added ? '移出试题篮' : '加入试题篮'}
    </Button>
  )
}

/** 已加入试题篮时，题目文本变灰 */
export function BasketQuestionText({
  id,
  className,
  children,
}: {
  id: string
  className?: string
  children: ReactNode
}) {
  const added = useQuestionBasket((state) =>
    state.items.some((item) => item.id === id),
  )

  return (
    <div className={cn('transition-opacity', added && 'opacity-40', className)}>{children}</div>
  )
}
