const CHAR_W = 5
const CHAR_H = 7
const CHAR_D = 2
const SPACING = 2 // gap between characters
const CHAR_STRIDE = CHAR_W + SPACING
const PLATFORM_H = 3 // platform thickness

const digit4 = [
	[1, 0, 0, 1, 0],
	[1, 0, 0, 1, 0],
	[1, 0, 0, 1, 0],
	[1, 1, 1, 1, 1],
	[0, 0, 0, 1, 0],
	[0, 0, 0, 1, 0],
	[0, 0, 0, 1, 0],
]

const digit0 = [
	[0, 1, 1, 1, 0],
	[1, 0, 0, 0, 1],
	[1, 0, 0, 0, 1],
	[1, 0, 0, 0, 1],
	[1, 0, 0, 0, 1],
	[1, 0, 0, 0, 1],
	[0, 1, 1, 1, 0],
]

const chars = [digit4, digit0, digit4]

export function getTextVoxels(offsetX = 0, offsetY = 0, offsetZ = 0) {
	const voxels = []

	for (let ci = 0; ci < chars.length; ci++) {
		const char = chars[ci]
		const baseX = offsetX + ci * CHAR_STRIDE
		for (let row = 0; row < CHAR_H; row++) {
			for (let col = 0; col < CHAR_W; col++) {
				if (char[row][col]) {
					for (let d = 0; d < CHAR_D; d++) {
						voxels.push({
							x: baseX + col,
							y: offsetY + (CHAR_H - 1 - row),
							z: offsetZ + d,
						})
					}
				}
			}
		}
	}

	return voxels
}

export function getPlatformVoxels(startX, endX, startZ, endZ, y) {
	const voxels = []
	for (let ly = 0; ly < PLATFORM_H; ly++) {
		for (let lx = startX; lx <= endX; lx++) {
			for (let lz = startZ; lz <= endZ; lz++) {
				voxels.push({ x: lx, y: y + ly, z: lz })
			}
		}
	}
	return voxels
}

export function getTotalSceneBounds() {
	const totalW = chars.length * CHAR_STRIDE - SPACING
	const startX = -2
	const endX = totalW + 1
	const startZ = -2
	const endZ = CHAR_D + 1
	const maxY = CHAR_H + PLATFORM_H - 1
	return { startX, endX, startZ, endZ, maxY, totalW, charDepth: CHAR_D }
}
