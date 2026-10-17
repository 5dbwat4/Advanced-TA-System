/** 分组内的单个头像条目（精灵图定位见 col / row）。 */
export interface AvatarEntry {
	/** 显示名 */
	name: string
	/** 整数 id，全局唯一，持久化在 User.avatar */
	id: number
	/** 原图相对路径（仅作记录） */
	file: string
	/** 精灵图列下标 */
	col: number
	/** 精灵图行下标 */
	row: number
}

/** 头像分组：一组头像共用同一张精灵图（atlas）。 */
export interface AvatarGroup {
	/** 分组名 */
	name: string
	/** 分组说明（可选） */
	description?: string
	/** 精灵图资源 URL（由打包器产出） */
	atlas: string
	/** 单元格边长（px） */
	cell: number
	/** 精灵图列数 */
	columns: number
	/** 精灵图行数 */
	rows: number
	avatars: AvatarEntry[]
}

/** id → 精灵图定位信息（跨分组扁平）。 */
export interface AvatarSprite {
	name: string
	group: string
	atlas: string
	cell: number
	columns: number
	rows: number
	col: number
	row: number
}

/** 头像分组目录。 */
export declare const groups: AvatarGroup[]

/** id → 精灵图定位信息。 */
export declare const avatars: Record<number, AvatarSprite>

/** 全部可选头像 id（升序）。 */
export declare const avatarIds: number[]

/**
 * id → 精灵图定位信息；未登记或为空返回 null（调用方回退默认，如首字母）。
 */
export declare function avatarSprite(id: number | null | undefined): AvatarSprite | null
