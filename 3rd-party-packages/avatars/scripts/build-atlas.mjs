// 生成 atlas 与 index.js：把每个分组的头像原图拼成一张精灵图（atlas），
// 再由 index.js 以 ESM 资源 import 引用（交给打包器产出带 hash 的资源，
// 不落在 public/、也不内联成 base64）。
//
// 用法（需自行安装 sharp）：
//   node scripts/build-atlas.mjs --config <config.json> [--root <包目录>]
//
// config.json：
//   [
//     {
//       "name": "Genshin",
//       "description": "可选说明",
//       "index_json": "avatars/index.json",
//       "cell": 256
//     }
//   ]
//   - name      ：分组名（同时决定 atlas 文件名）
//   - description：分组说明（可选，写入 manifest / index.js）
//   - index_json：头像索引 JSON，内容为 [{ "file": "A.png", "name": "Aether" }]
//                 file 相对索引文件所在目录，name 为显示名，数组顺序即精灵图顺序
//   - index_begin：头像 id 起始值（可选，如 1000 表示本组 id 为 1000, 1001, …）
//   - source    ：原图根目录（不使用 index_json 时）
//   - glob      ：相对 source 的匹配式（`*` 单段通配，`**` 任意层级）
//   - cell      ：单元格边长（缺省取该组图片的最大边）
//   - format    ：atlas 格式 webp（默认）| png
//
// 产物（写入 --root，默认本包目录）：
//   atlas/atlas.<folder>.<ext>   精灵图（folder 为 index_json 所在目录名 / source 目录名）
//   manifest.json                分组与头像清单（name / description / id / file）
//   index.js                     生成的导出（groups / avatars / avatarIds / avatarSprite）

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

function parseArgs(argv) {
	const args = {}
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i]
		if (!token.startsWith('--')) continue
		const key = token.slice(2)
		const next = argv[i + 1]
		if (next === undefined || next.startsWith('--')) {
			args[key] = true
		} else {
			args[key] = next
			i += 1
		}
	}
	return args
}

/** 收集 dir 下全部文件，返回相对路径（用 / 分隔）。 */
function walk(dir) {
	const out = []
	const stack = ['']
	while (stack.length) {
		const rel = stack.pop()
		const abs = rel ? join(dir, rel) : dir
		for (const name of readdirSync(abs)) {
			const childRel = rel ? `${rel}/${name}` : name
			const childAbs = join(abs, name)
			if (statSync(childAbs).isDirectory()) stack.push(childRel)
			else out.push(childRel)
		}
	}
	return out
}

/** 极简 glob → RegExp：`*` 匹配单段内任意字符，`**` 匹配任意层级。 */
function globToRegExp(pattern) {
	let re = ''
	for (let i = 0; i < pattern.length; i += 1) {
		const ch = pattern[i]
		if (ch === '*') {
			if (pattern[i + 1] === '*') {
				re += '.*'
				i += 1
			} else {
				re += '[^/]*'
			}
		} else if ('\\^$+.()|{}[]'.includes(ch)) {
			re += `\\${ch}`
		} else {
			re += ch
		}
	}
	return new RegExp(`^${re}$`)
}

function slugify(name) {
	const slug = String(name)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
	return slug || 'group'
}

function identifier(name, used) {
	const base =
		String(name)
			.replace(/[^a-zA-Z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '')
			.toLowerCase() || 'atlas'
	let id = /^[0-9]/.test(base) ? `a_${base}` : base
	let n = 1
	while (used.has(id)) {
		id = `${base}_${n}`
		n += 1
	}
	used.add(id)
	return id
}

const args = parseArgs(process.argv.slice(2))
if (!args.config) {
	console.error('用法：node scripts/build-atlas.mjs --config <config.json> [--root <包目录>]')
	process.exit(1)
}

const root = args.root ? String(args.root) : fileURLToPath(new URL('..', import.meta.url))
const configPath = resolve(String(args.config))
const configDir = dirname(configPath)
const config = JSON.parse(readFileSync(configPath, 'utf8'))
if (!Array.isArray(config)) throw new Error('config 顶层必须是分组数组')

const FORMAT_EXT = { webp: '.webp', png: '.png' }

const manifest = []
const groups = []
const flat = []
const importLines = []
const usedIdentifiers = new Set()
const usedIds = new Set()
let nextId = 1

mkdirSync(join(root, 'atlas'), { recursive: true })

for (const group of config) {
	const name = String(group?.name ?? '').trim()
	const description = String(group?.description ?? '').trim()
	const indexJson = String(group?.index_json ?? '').trim()
	const source = String(group?.source ?? '').trim()
	const pattern = String(group?.glob ?? '**/*').trim()
	const format = String(group?.format ?? 'webp').toLowerCase()
	const quality = Number(group?.quality ?? 85)
	const indexBegin = group?.index_begin === undefined ? null : Number(group.index_begin)
	if (!name) throw new Error('分组缺少 name')
	if (!indexJson && !source) throw new Error(`[${name}] 缺少 index_json 或 source`)
	if (!FORMAT_EXT[format]) throw new Error(`[${name}] 不支持的格式：${format}`)
	if (indexBegin !== null && (!Number.isInteger(indexBegin) || indexBegin < 0)) {
		throw new Error(`[${name}] index_begin 必须是非负整数`)
	}

	let items
	let folderName
	if (indexJson) {
		const indexPath = isAbsolute(indexJson) ? indexJson : resolve(configDir, indexJson)
		folderName = basename(dirname(indexPath))
		const list = JSON.parse(readFileSync(indexPath, 'utf8'))
		if (!Array.isArray(list) || list.length === 0) {
			throw new Error(`[${name}] index_json 必须是非空数组：${indexPath}`)
		}
		items = list.map((entry, index) => {
			const file = String(entry?.file ?? '').trim()
			const avatarName = String(entry?.name ?? '').trim()
			if (!file || !avatarName) {
				throw new Error(`[${name}] index_json 第 ${index + 1} 项缺少 file 或 name`)
			}
			const abs = isAbsolute(file) ? file : resolve(dirname(indexPath), file)
			return { file, name: avatarName, abs }
		})
	} else {
		folderName = basename(resolve(source))
		const matcher = globToRegExp(pattern)
		const files = walk(source)
			.filter((rel) => matcher.test(rel))
			.sort((a, b) => a.localeCompare(b, 'en'))
		if (files.length === 0) throw new Error(`[${name}] 未匹配到任何图片：${source} / ${pattern}`)
		items = files.map((rel) => ({ file: rel, name: rel.split('/')[0], abs: join(source, rel) }))
	}

	let cell = Number(group?.cell ?? 0)
	if (!cell) {
		for (const item of items) {
			const meta = await sharp(item.abs).metadata()
			cell = Math.max(cell, meta.width ?? 0, meta.height ?? 0)
		}
	}
	if (!cell) throw new Error(`[${name}] 无法确定单元格尺寸`)

	const columns = Math.ceil(Math.sqrt(items.length))
	const rows = Math.ceil(items.length / columns)
	const composites = []
	const avatarEntries = []
	const manifestAvatars = []
	const varName = identifier(name, usedIdentifiers)
	const baseId = indexBegin ?? nextId

	items.forEach((item, index) => {
		const col = index % columns
		const row = Math.floor(index / columns)
		const avatarName = item.name
		const id = baseId + index
		if (usedIds.has(id)) throw new Error(`[${name}] 头像 id 冲突：${id}`)
		usedIds.add(id)

		composites.push({ input: item.abs, left: col * cell, top: row * cell })
		avatarEntries.push({ name: avatarName, id, file: item.file, col, row })
		manifestAvatars.push({ name: avatarName, id, file: item.file })
		flat.push({ id, name: avatarName, group: name, varName, cell, columns, rows, col, row })
	})
	nextId = Math.max(nextId, baseId + items.length)

	const atlasFile = `atlas-${slugify(folderName)}${FORMAT_EXT[format]}`
	await sharp({
		create: { width: columns * cell, height: rows * cell, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
	})
		.composite(composites)
		.toFormat(format, { quality })
		.toFile(join(root, 'atlas', atlasFile))

	importLines.push(`import ${varName} from './atlas/${atlasFile}'`)
	groups.push({ name, description, varName, cell, columns, rows, avatarEntries })
	manifest.push({ name, ...(description ? { description } : {}), avatars: manifestAvatars })

	console.log(`[${name}] ${items.length} 张 → ${columns}×${rows} @${cell}px，atlas/${atlasFile}`)
}

const groupsLiteral = groups
	.map((g) => {
		const rowsText = g.avatarEntries
			.map(
				(a) =>
					`\t\t\t{ name: ${JSON.stringify(a.name)}, id: ${a.id}, file: ${JSON.stringify(a.file)}, col: ${a.col}, row: ${a.row} },`,
			)
			.join('\n')
		return [
			'\t{',
			`\t\tname: ${JSON.stringify(g.name)},`,
			...(g.description ? [`\t\tdescription: ${JSON.stringify(g.description)},`] : []),
			`\t\tatlas: ${g.varName},`,
			`\t\tcell: ${g.cell},`,
			`\t\tcolumns: ${g.columns},`,
			`\t\trows: ${g.rows},`,
			'\t\tavatars: [',
			rowsText,
			'\t\t],',
			'\t},',
		].join('\n')
	})
	.join('\n')

const flatLiteral = flat
	.sort((a, b) => a.id - b.id)
	.map(
		(a) =>
			`\t${a.id}: { name: ${JSON.stringify(a.name)}, group: ${JSON.stringify(a.group)}, atlas: ${a.varName}, cell: ${a.cell}, columns: ${a.columns}, rows: ${a.rows}, col: ${a.col}, row: ${a.row} },`,
	)
	.join('\n')

const idList = flat
	.map((a) => a.id)
	.sort((x, y) => x - y)
	.join(', ')

const content = `// DO NOT MODIFY UNLESS YOU KNOW WHAT YOU ARE DOING
${importLines.join('\n')}

export const groups = [
${groupsLiteral}
]

export const avatars = {
${flatLiteral}
}

export const avatarIds = [${idList}]

export function avatarSprite(id) {
	if (id === null || id === undefined) return null
	return avatars[id] ?? null
}
`

writeFileSync(join(root, 'index.js'), content)
writeFileSync(join(root, 'manifest.json'), `${JSON.stringify(manifest, null, '\t')}\n`)
console.log(`已生成 index.js 与 manifest.json（${groups.length} 个分组，${flat.length} 个头像）`)
