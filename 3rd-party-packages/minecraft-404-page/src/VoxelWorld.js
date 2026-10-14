import * as THREE from './vendor/three.module.js'

const faces = [
	{ // left
		dir: [-1, 0, 0],
		faceType: 'side',
		corners: [
			{ pos: [0, 1, 0], uv: [0, 1] },
			{ pos: [0, 0, 0], uv: [0, 0] },
			{ pos: [0, 1, 1], uv: [1, 1] },
			{ pos: [0, 0, 1], uv: [1, 0] },
		],
	},
	{ // right
		dir: [1, 0, 0],
		faceType: 'side',
		corners: [
			{ pos: [1, 1, 1], uv: [0, 1] },
			{ pos: [1, 0, 1], uv: [0, 0] },
			{ pos: [1, 1, 0], uv: [1, 1] },
			{ pos: [1, 0, 0], uv: [1, 0] },
		],
	},
	{ // bottom
		dir: [0, -1, 0],
		faceType: 'bottom',
		corners: [
			{ pos: [1, 0, 1], uv: [1, 0] },
			{ pos: [0, 0, 1], uv: [0, 0] },
			{ pos: [1, 0, 0], uv: [1, 1] },
			{ pos: [0, 0, 0], uv: [0, 1] },
		],
	},
	{ // top
		dir: [0, 1, 0],
		faceType: 'top',
		corners: [
			{ pos: [0, 1, 1], uv: [1, 1] },
			{ pos: [1, 1, 1], uv: [0, 1] },
			{ pos: [0, 1, 0], uv: [1, 0] },
			{ pos: [1, 1, 0], uv: [0, 0] },
		],
	},
	{ // back
		dir: [0, 0, -1],
		faceType: 'side',
		corners: [
			{ pos: [1, 0, 0], uv: [0, 0] },
			{ pos: [0, 0, 0], uv: [1, 0] },
			{ pos: [1, 1, 0], uv: [0, 1] },
			{ pos: [0, 1, 0], uv: [1, 1] },
		],
	},
	{ // front
		dir: [0, 0, 1],
		faceType: 'side',
		corners: [
			{ pos: [0, 0, 1], uv: [0, 0] },
			{ pos: [1, 0, 1], uv: [1, 0] },
			{ pos: [0, 1, 1], uv: [0, 1] },
			{ pos: [1, 1, 1], uv: [1, 1] },
		],
	},
]

export class VoxelWorld {
	constructor(options) {
		this.cellSize = options.cellSize
		this.tileSize = options.tileSize
		this.tileTextureWidth = options.tileTextureWidth
		this.tileTextureHeight = options.tileTextureHeight
		this.atlasCols = options.atlasCols
		this.blockTypeSlots = options.blockTypeSlots
		this.cells = {}
	}

	computeVoxelOffset(x, y, z) {
		const { cellSize } = this
		const voxelX = THREE.MathUtils.euclideanModulo(x, cellSize) | 0
		const voxelY = THREE.MathUtils.euclideanModulo(y, cellSize) | 0
		const voxelZ = THREE.MathUtils.euclideanModulo(z, cellSize) | 0
		return voxelY * cellSize * cellSize + voxelZ * cellSize + voxelX
	}

	computeCellId(x, y, z) {
		const { cellSize } = this
		const cellX = Math.floor(x / cellSize)
		const cellY = Math.floor(y / cellSize)
		const cellZ = Math.floor(z / cellSize)
		return `${cellX},${cellY},${cellZ}`
	}

	addCellForVoxel(x, y, z) {
		const cellId = this.computeCellId(x, y, z)
		let cell = this.cells[cellId]
		if (!cell) {
			const { cellSize } = this
			cell = new Uint8Array(cellSize * cellSize * cellSize)
			this.cells[cellId] = cell
		}
		return cell
	}

	getCellForVoxel(x, y, z) {
		return this.cells[this.computeCellId(x, y, z)]
	}

	setVoxel(x, y, z, v, addCell = true) {
		let cell = this.getCellForVoxel(x, y, z)
		if (!cell) {
			if (!addCell) return
			cell = this.addCellForVoxel(x, y, z)
		}
		const offset = this.computeVoxelOffset(x, y, z)
		cell[offset] = v
	}

	getVoxel(x, y, z) {
		const cell = this.getCellForVoxel(x, y, z)
		if (!cell) return 0
		const offset = this.computeVoxelOffset(x, y, z)
		return cell[offset]
	}

	generateGeometryDataForCell(cellX, cellY, cellZ) {
		const { cellSize, tileSize, tileTextureWidth, tileTextureHeight, atlasCols, blockTypeSlots } = this
		const positions = []
		const normals = []
		const uvs = []
		const indices = []
		const startX = cellX * cellSize
		const startY = cellY * cellSize
		const startZ = cellZ * cellSize

		for (let y = 0; y < cellSize; ++y) {
			const voxelY = startY + y
			for (let z = 0; z < cellSize; ++z) {
				const voxelZ = startZ + z
				for (let x = 0; x < cellSize; ++x) {
					const voxelX = startX + x
					const voxel = this.getVoxel(voxelX, voxelY, voxelZ)
					if (voxel) {
						const slots = blockTypeSlots[voxel - 1]
						for (const { dir, faceType, corners } of faces) {
							const neighbor = this.getVoxel(
								voxelX + dir[0],
								voxelY + dir[1],
								voxelZ + dir[2]
							)
							if (!neighbor) {
								const slot = faceType === 'top' ? slots.topSlot
									: faceType === 'bottom' ? slots.bottomSlot
									: slots.sideSlot

								const uBase = (slot % atlasCols) * tileSize / tileTextureWidth
								const vBase = Math.floor(slot / atlasCols) * tileSize / tileTextureHeight

								const ndx = positions.length / 3
								for (const { pos, uv } of corners) {
									positions.push(pos[0] + x, pos[1] + y, pos[2] + z)
									normals.push(...dir)
									uvs.push(
										uBase + uv[0] * tileSize / tileTextureWidth,
										vBase + (1 - uv[1]) * tileSize / tileTextureHeight
									)
								}
								indices.push(
									ndx, ndx + 1, ndx + 2,
									ndx + 2, ndx + 1, ndx + 3
								)
							}
						}
					}
				}
			}
		}

		return { positions, normals, uvs, indices }
	}

	intersectRay(start, end) {
		let dx = end.x - start.x
		let dy = end.y - start.y
		let dz = end.z - start.z
		const lenSq = dx * dx + dy * dy + dz * dz
		const len = Math.sqrt(lenSq)

		dx /= len
		dy /= len
		dz /= len

		let t = 0.0
		let ix = Math.floor(start.x)
		let iy = Math.floor(start.y)
		let iz = Math.floor(start.z)

		const stepX = dx > 0 ? 1 : -1
		const stepY = dy > 0 ? 1 : -1
		const stepZ = dz > 0 ? 1 : -1

		const txDelta = Math.abs(1 / dx)
		const tyDelta = Math.abs(1 / dy)
		const tzDelta = Math.abs(1 / dz)

		const xDist = stepX > 0 ? ix + 1 - start.x : start.x - ix
		const yDist = stepY > 0 ? iy + 1 - start.y : start.y - iy
		const zDist = stepZ > 0 ? iz + 1 - start.z : start.z - iz

		let txMax = txDelta < Infinity ? txDelta * xDist : Infinity
		let tyMax = tyDelta < Infinity ? tyDelta * yDist : Infinity
		let tzMax = tzDelta < Infinity ? tzDelta * zDist : Infinity

		let steppedIndex = -1

		while (t <= len) {
			const voxel = this.getVoxel(ix, iy, iz)
			if (voxel) {
				return {
					position: [
						start.x + t * dx,
						start.y + t * dy,
						start.z + t * dz,
					],
					normal: [
						steppedIndex === 0 ? -stepX : 0,
						steppedIndex === 1 ? -stepY : 0,
						steppedIndex === 2 ? -stepZ : 0,
					],
					voxel,
				}
			}

			if (txMax < tyMax) {
				if (txMax < tzMax) {
					ix += stepX
					t = txMax
					txMax += txDelta
					steppedIndex = 0
				} else {
					iz += stepZ
					t = tzMax
					tzMax += tzDelta
					steppedIndex = 2
				}
			} else {
				if (tyMax < tzMax) {
					iy += stepY
					t = tyMax
					tyMax += tyDelta
					steppedIndex = 1
				} else {
					iz += stepZ
					t = tzMax
					tzMax += tzDelta
					steppedIndex = 2
				}
			}
		}

		return null
	}
}
