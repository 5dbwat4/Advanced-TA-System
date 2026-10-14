import type { CSSProperties, ReactElement } from 'react'

/** Minecraft404 组件属性。 */
export interface Minecraft404Props {
	/** 外层容器的 class（画布会撑满容器）。 */
	className?: string
	/** 外层容器的内联样式（画布会撑满容器）。 */
	style?: CSSProperties
	/** 场景构建完成、且已绘制出第一帧后触发一次（可用于隐藏 loading）。 */
	onReady?: () => void
}

/**
 * Minecraft 风格的 404 场景：three.js 体素 “404”，可拖拽旋转，
 * 左键放置方块、右键移除方块。
 */
export function Minecraft404(props?: Minecraft404Props): ReactElement

export default Minecraft404
