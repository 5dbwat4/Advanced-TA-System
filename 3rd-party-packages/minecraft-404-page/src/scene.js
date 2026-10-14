import * as THREE from './vendor/three.module.js'
import { OrbitControls } from './vendor/OrbitControls.js'

import { textures } from './textures.js'
import { getPlatformVoxels, getTextVoxels, getTotalSceneBounds } from './textLayout.js'
import { VoxelWorld } from './VoxelWorld.js'

// 纹理清单：bedrock / sand 只作为地基色板备选，不参与随机 block 类型。
const allTextures = []
for (const [name, url] of Object.entries(textures)) {
	if (name === 'bedrock' || name === 'sand') continue
	allTextures.push({ name, url })
}

const texNameToSlot = {}
const slotUrls = []
allTextures.forEach(({ name, url }, i) => {
	texNameToSlot[name] = i
	slotUrls.push(url)
})

function baseName(n) {
	return n.replace(/_top$/, '').replace(/_bottom$/, '').replace(/_side$/, '')
}

const groups = {}
allTextures.forEach(({ name }) => {
	const bn = baseName(name)
	if (!groups[bn]) groups[bn] = {}
	groups[bn][name] = true
})

const blockTypeSlots = []
const blockTypeNames = []
for (const [bn, files] of Object.entries(groups)) {
	const keys = Object.keys(files)

	let sideTexture = bn
	if (!files[bn]) {
		if (files[bn + '_side']) sideTexture = bn + '_side'
		else if (files[bn + '_top']) sideTexture = bn + '_top'
		else sideTexture = keys[0]
	}

	const topTexture = files[bn + '_top'] ? bn + '_top' : sideTexture
	const bottomTexture = files[bn + '_bottom'] ? bn + '_bottom' : (files[bn + '_top'] ? bn + '_top' : sideTexture)

	blockTypeSlots.push({
		topSlot: texNameToSlot[topTexture],
		sideSlot: texNameToSlot[sideTexture],
		bottomSlot: texNameToSlot[bottomTexture],
	})
	blockTypeNames.push(bn)
}

const groundNames = [
	'dirt', 'stone', 'cobblestone', 'gravel', 'cobbled_deepslate',
	'mud', 'rooted_dirt', 'andesite', 'diorite', 'granite', 'tuff', 'deepslate', 'smooth_stone',
]
const groundTypeIndices = groundNames
	.map((n) => blockTypeNames.indexOf(n) + 1)
	.filter((i) => i > 0)

const numTypes = blockTypeSlots.length

function buildAtlasTexture() {
	const tileSize = 16
	const count = slotUrls.length
	const cols = Math.ceil(Math.sqrt(count))
	const rows = Math.ceil(count / cols)

	const canvas = document.createElement('canvas')
	canvas.width = cols * tileSize
	canvas.height = rows * tileSize
	const ctx = canvas.getContext('2d')
	ctx.fillStyle = '#808080'
	ctx.fillRect(0, 0, canvas.width, canvas.height)

	const texture = new THREE.CanvasTexture(canvas)
	texture.magFilter = THREE.NearestFilter
	texture.minFilter = THREE.NearestFilter
	texture.colorSpace = THREE.SRGBColorSpace
	texture.flipY = false

	return {
		texture,
		canvas,
		ctx,
		tileSize,
		tileTextureWidth: canvas.width,
		tileTextureHeight: canvas.height,
		cols,
	}
}

function drawSlotToAtlas(atlas, slotIndex) {
	return new Promise((resolve) => {
		const url = slotUrls[slotIndex]
		if (!url) {
			resolve()
			return
		}

		const img = new Image()
		img.onload = () => {
			const col = slotIndex % atlas.cols
			const row = Math.floor(slotIndex / atlas.cols)
			atlas.ctx.drawImage(img, col * atlas.tileSize, row * atlas.tileSize, atlas.tileSize, atlas.tileSize)
			atlas.texture.needsUpdate = true
			resolve()
		}
		img.onerror = () => {
			const col = slotIndex % atlas.cols
			const row = Math.floor(slotIndex / atlas.cols)
			atlas.ctx.fillStyle = `hsl(${(slotIndex * 37) % 360}, 60%, 50%)`
			atlas.ctx.fillRect(col * atlas.tileSize, row * atlas.tileSize, atlas.tileSize, atlas.tileSize)
			atlas.texture.needsUpdate = true
			resolve()
		}
		img.src = url
	})
}

const neighborOffsets = [
	[0, 0, 0],
	[-1, 0, 0], [1, 0, 0],
	[0, -1, 0], [0, 1, 0],
	[0, 0, -1], [0, 0, 1],
]

function randInt(min, max) {
	return Math.floor(Math.random() * (max - min) + min)
}

/**
 * 在给定 canvas 上创建可交互的 Minecraft 风格 “404” 体素场景。
 * 画布背景透明，直接融入所在页面的底色。
 * 返回一个 dispose 函数；调用后释放 GPU 资源、事件监听与动画帧。
 *
 * @param {HTMLCanvasElement} canvas
 */
export function createScene(canvas, options = {}) {
	const { onReady } = options
	let disposed = false

	const listeners = []
	function on(target, type, handler, options) {
		target.addEventListener(type, handler, options)
		listeners.push(() => target.removeEventListener(type, handler, options))
	}

	const renderer = new THREE.WebGLRenderer({ antialias: true, canvas, alpha: true })
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
	renderer.setClearAlpha(0)
	renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false)

	const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 500)
	camera.position.set(30, 20, 40)

	const scene = new THREE.Scene()

	scene.add(new THREE.AmbientLight(0xffffff, 0.6))

	const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
	dirLight.position.set(30, 40, 20)
	scene.add(dirLight)

	const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4)
	dirLight2.position.set(-10, 10, -10)
	scene.add(dirLight2)

	const controls = new OrbitControls(camera, canvas)
	controls.enableDamping = true
	controls.dampingFactor = 0.1

	const bounds = getTotalSceneBounds()
	const cameraDirection = new THREE.Vector3(10, 12, 37).normalize()

	// 场景实际范围（地台比 “404” 文字本身更宽更深）。
	const sceneMin = new THREE.Vector3(-2, 0, -2)
	const sceneMax = new THREE.Vector3(bounds.totalW + 1, bounds.maxY, bounds.charDepth + 1)
	const sceneCenter = sceneMin.clone().add(sceneMax).multiplyScalar(0.5)
	const sceneHalf = sceneMax.clone().sub(sceneMin).multiplyScalar(0.5)

	const worldUp = new THREE.Vector3(0, 1, 0)
	const camRight = new THREE.Vector3()
	const camUp = new THREE.Vector3()
	const forward = cameraDirection.clone().negate()
	camRight.crossVectors(forward, worldUp).normalize()
	camUp.crossVectors(camRight, forward).normalize()

	// 把包围盒投影到相机的右/上轴，得到屏幕上的半宽/半高，据此取景。
	const halfX =
		Math.abs(camRight.x) * sceneHalf.x +
		Math.abs(camRight.y) * sceneHalf.y +
		Math.abs(camRight.z) * sceneHalf.z
	const halfY =
		Math.abs(camUp.x) * sceneHalf.x +
		Math.abs(camUp.y) * sceneHalf.y +
		Math.abs(camUp.z) * sceneHalf.z

	function fitCamera() {
		const aspect =
			canvas.clientWidth > 0 && canvas.clientHeight > 0
				? canvas.clientWidth / canvas.clientHeight
				: camera.aspect

		const vHalf = (camera.fov * Math.PI) / 360
		const hHalf = Math.atan(Math.tan(vHalf) * aspect)
		const distance = Math.max(halfY / Math.tan(vHalf), halfX / Math.tan(hHalf)) * 1.2

		camera.aspect = aspect
		controls.target.copy(sceneCenter)
		camera.position.copy(sceneCenter).addScaledVector(cameraDirection, distance)
		camera.updateProjectionMatrix()
		controls.update()
	}

	fitCamera()

	// 场景主体在贴图加载完成后异步构建；dispose 早于完成时不再继续。
	const cellIdToMesh = {}
	let atlas = null
	let material = null
	let world = null
	let rollOverMesh = null
	let rollOverGeo = null
	let rollOverMaterial = null

	function resizeRendererToDisplaySize() {
		const ratio = renderer.getPixelRatio()
		const w = canvas.clientWidth
		const h = canvas.clientHeight
		const needResize =
			canvas.width !== Math.floor(w * ratio) || canvas.height !== Math.floor(h * ratio)
		if (needResize) renderer.setSize(w, h, false)
		return needResize
	}

	let frameId = 0
	function render() {
		if (disposed) return
		frameId = requestAnimationFrame(render)
		if (resizeRendererToDisplaySize()) fitCamera()
		controls.update()
		renderer.render(scene, camera)
	}

	function updateCellGeometry(x, y, z) {
		const cellSize = world.cellSize
		const cellX = Math.floor(x / cellSize)
		const cellY = Math.floor(y / cellSize)
		const cellZ = Math.floor(z / cellSize)
		const cellId = world.computeCellId(x, y, z)
		let mesh = cellIdToMesh[cellId]
		const geometry = mesh ? mesh.geometry : new THREE.BufferGeometry()

		const { positions, normals, uvs, indices } = world.generateGeometryDataForCell(cellX, cellY, cellZ)
		geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
		geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3))
		geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2))
		geometry.setIndex(indices)
		geometry.computeBoundingSphere()

		if (!mesh) {
			mesh = new THREE.Mesh(geometry, material)
			mesh.name = cellId
			cellIdToMesh[cellId] = mesh
			scene.add(mesh)
			mesh.position.set(cellX * cellSize, cellY * cellSize, cellZ * cellSize)
		}
	}

	function updateVoxelGeometry(x, y, z) {
		const updatedCellIds = {}
		for (const offset of neighborOffsets) {
			const ox = x + offset[0]
			const oy = y + offset[1]
			const oz = z + offset[2]
			const cellId = world.computeCellId(ox, oy, oz)
			if (!updatedCellIds[cellId]) {
				updatedCellIds[cellId] = true
				updateCellGeometry(ox, oy, oz)
			}
		}
	}

	function buildWorld() {
		const textVoxels = getTextVoxels(0, 3, 0)
		for (const { x, y, z } of textVoxels) {
			world.setVoxel(x, y, z, randInt(1, numTypes + 1))
		}

		const plat = getPlatformVoxels(-2, bounds.totalW + 1, -2, bounds.charDepth + 1, 0)
		for (const { x, y, z } of plat) {
			world.setVoxel(x, y, z, groundTypeIndices[randInt(0, groundTypeIndices.length)])
		}

		for (let y = 0; y < bounds.maxY; y++) {
			for (let x = -2; x < bounds.totalW + 2; x++) {
				for (let z = -2; z < bounds.charDepth + 2; z++) {
					if (world.getVoxel(x, y, z)) updateVoxelGeometry(x, y, z)
				}
			}
		}

		rollOverGeo = new THREE.BoxGeometry(1, 1, 1)
		rollOverMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, opacity: 0.4, transparent: true })
		rollOverMesh = new THREE.Mesh(rollOverGeo, rollOverMaterial)
		rollOverMesh.visible = false
		scene.add(rollOverMesh)
	}

	void (async () => {
		const nextAtlas = buildAtlasTexture()
		await Promise.all(slotUrls.map((_, i) => drawSlotToAtlas(nextAtlas, i)))
		if (disposed) {
			nextAtlas.texture.dispose()
			return
		}
		atlas = nextAtlas

		material = new THREE.MeshLambertMaterial({
			map: atlas.texture,
			side: THREE.DoubleSide,
			alphaTest: 0.1,
			transparent: true,
		})

		world = new VoxelWorld({
			cellSize: 32,
			tileSize: atlas.tileSize,
			tileTextureWidth: atlas.tileTextureWidth,
			tileTextureHeight: atlas.tileTextureHeight,
			atlasCols: atlas.cols,
			blockTypeSlots,
		})

		buildWorld()

		// 等第一帧把场景画出来后再通知“已就绪”（避免闪过空白帧）。
		if (typeof onReady === 'function') {
			requestAnimationFrame(() => {
				if (!disposed) onReady()
			})
		}
	})()

	const mouse = { x: 0, y: 0, moveX: 0, moveY: 0 }

	function getCanvasRelativePosition(event) {
		const rect = canvas.getBoundingClientRect()
		return {
			x: ((event.clientX - rect.left) * canvas.width) / rect.width,
			y: ((event.clientY - rect.top) * canvas.height) / rect.height,
		}
	}

	function intersectVoxel(event) {
		if (!world) return null
		const pos = getCanvasRelativePosition(event)
		const x = (pos.x / canvas.width) * 2 - 1
		const y = (pos.y / canvas.height) * -2 + 1
		const start = new THREE.Vector3()
		const end = new THREE.Vector3()
		start.setFromMatrixPosition(camera.matrixWorld)
		end.set(x, y, 1).unproject(camera)
		return world.intersectRay(start, end)
	}

	function placeVoxel(event) {
		const intersection = intersectVoxel(event)
		if (!intersection) return

		const type = randInt(1, numTypes + 1)
		const pos = intersection.position.map((v, ndx) => v + intersection.normal[ndx] * 0.5)
		const px = Math.floor(pos[0])
		const py = Math.floor(pos[1])
		const pz = Math.floor(pos[2])
		world.setVoxel(px, py, pz, type)
		updateVoxelGeometry(px, py, pz)
	}

	function removeVoxel(event) {
		const intersection = intersectVoxel(event)
		if (!intersection) return

		const pos = intersection.position.map((v, ndx) => v + intersection.normal[ndx] * -0.5)
		const px = Math.floor(pos[0])
		const py = Math.floor(pos[1])
		const pz = Math.floor(pos[2])
		world.setVoxel(px, py, pz, 0)
		updateVoxelGeometry(px, py, pz)
	}

	function showRollOver(event) {
		if (!rollOverMesh) return
		const intersection = intersectVoxel(event)
		if (!intersection) {
			rollOverMesh.visible = false
			return
		}
		const pos = intersection.position.map((v, ndx) => v + intersection.normal[ndx] * 0.5)
		rollOverMesh.position.set(
			Math.floor(pos[0]) + 0.5,
			Math.floor(pos[1]) + 0.5,
			Math.floor(pos[2]) + 0.5
		)
		rollOverMesh.visible = true
	}

	function recordStartPosition(event) {
		mouse.x = event.clientX
		mouse.y = event.clientY
		mouse.moveX = 0
		mouse.moveY = 0
	}

	function recordMovement(event) {
		mouse.moveX += Math.abs(mouse.x - event.clientX)
		mouse.moveY += Math.abs(mouse.y - event.clientY)
	}

	function onPointerUp(event) {
		if (mouse.moveX < 5 && mouse.moveY < 5) {
			if (event.button === 0) placeVoxel(event)
			else if (event.button === 2) removeVoxel(event)
		}
		window.removeEventListener('pointermove', recordMovement)
		window.removeEventListener('pointerup', onPointerUp)
	}

	on(canvas, 'pointerdown', (event) => {
		event.preventDefault()
		recordStartPosition(event)
		window.addEventListener('pointermove', recordMovement)
		window.addEventListener('pointerup', onPointerUp)
	})
	on(canvas, 'pointermove', showRollOver)
	on(canvas, 'contextmenu', (event) => event.preventDefault())
	on(controls, 'start', () => {
		if (rollOverMesh) rollOverMesh.visible = false
	})

	render()

	function dispose() {
		if (disposed) return
		disposed = true
		cancelAnimationFrame(frameId)
		window.removeEventListener('pointermove', recordMovement)
		window.removeEventListener('pointerup', onPointerUp)
		for (const off of listeners) off()
		listeners.length = 0
		controls.dispose()

		for (const mesh of Object.values(cellIdToMesh)) {
			scene.remove(mesh)
			mesh.geometry.dispose()
		}
		if (rollOverMesh) scene.remove(rollOverMesh)
		rollOverGeo?.dispose()
		rollOverMaterial?.dispose()
		material?.dispose()
		atlas?.texture.dispose()
		renderer.dispose()
	}

	return dispose
}
