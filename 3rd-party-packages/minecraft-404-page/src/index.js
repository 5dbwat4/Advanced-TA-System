import { createElement, useEffect, useRef } from 'react'

import { createScene } from './scene.js'

/**
 * Minecraft 风格的 404 场景：可拖拽旋转、点击增删方块的体素 “404”。
 * 用 createElement 而非 JSX 编写，便于作为纯 ESM 包被直接消费。
 */
export function Minecraft404({ className, style, onReady } = {}) {
	const hostRef = useRef(null)
	const onReadyRef = useRef(onReady)

	useEffect(() => {
		onReadyRef.current = onReady
	}, [onReady])

	useEffect(() => {
		const host = hostRef.current
		if (!host) return undefined

		const canvas = document.createElement('canvas')
		canvas.style.display = 'block'
		canvas.style.width = '100%'
		canvas.style.height = '100%'
		canvas.style.touchAction = 'none'
		host.appendChild(canvas)

		const dispose = createScene(canvas, {
			onReady: () => onReadyRef.current?.(),
		})

		return () => {
			dispose()
			canvas.remove()
		}
	}, [])

	return createElement('div', {
		ref: hostRef,
		className,
		style: { position: 'relative', width: '100%', height: '100%', ...style },
	})
}

export default Minecraft404
