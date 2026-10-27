export type LayoutRect = {
  x: number
  y: number
  width: number
  height: number
}

export type LayoutSize = {
  width: number
  height: number
}

export type LayoutPoint = {
  x: number
  y: number
}

function intersects(a: LayoutRect, b: LayoutRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

function verticalOverlap(a: LayoutRect, b: LayoutRect): boolean {
  return a.y < b.y + b.height && a.y + a.height > b.y
}

function horizontalOverlap(a: LayoutRect, b: LayoutRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x
}

function expand(rect: LayoutRect, amount: number): LayoutRect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  }
}

export function findSpecialDrawPlacement(
  rects: LayoutRect[],
  size: LayoutSize,
  gap = 60,
): LayoutPoint | null {
  if (rects.length === 0) return null

  const near = gap * 2
  const candidates: Array<LayoutPoint & { score: number }> = []

  for (const left of rects) {
    for (const above of rects) {
      const x = left.x + left.width + gap
      const y = above.y + above.height + gap
      const candidateRect: LayoutRect = { x, y, width: size.width, height: size.height }

      if (rects.some((rect) => intersects(candidateRect, expand(rect, gap / 2)))) {
        continue
      }

      const hasLeft = rects.some((rect) => {
        const right = rect.x + rect.width
        const distance = x - right
        return distance >= 0 && distance <= near && verticalOverlap(rect, candidateRect)
      })
      const hasAbove = rects.some((rect) => {
        const bottom = rect.y + rect.height
        const distance = y - bottom
        return distance >= 0 && distance <= near && horizontalOverlap(rect, candidateRect)
      })

      if (hasLeft && hasAbove) {
        candidates.push({ x, y, score: x + y })
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score)
    return candidates[0]
  }

  const minLeft = Math.min(...rects.map((rect) => rect.x))
  const minTop = Math.min(...rects.map((rect) => rect.y))
  const maxRight = Math.max(...rects.map((rect) => rect.x + rect.width))
  const maxBottom = Math.max(...rects.map((rect) => rect.y + rect.height))

  const topRight = { x: maxRight + gap, y: minTop }
  const bottomLeft = { x: minLeft, y: maxBottom + gap }

  return maxRight - minLeft >= maxBottom - minTop ? topRight : bottomLeft
}
