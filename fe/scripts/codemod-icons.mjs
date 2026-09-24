import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = path.join(root, 'src')

// Files handled manually (icon passed as a lowercase identifier prop).
const SKIP = new Set([
  'ui/Card.tsx',
  'console/StatCard.tsx',
  'checkoff/PreferenceOnboarding.tsx',
])

const ICON_IMPORT_MODULE = '@/components/ui/Icon'
const LUCIDE_RE = /^lucide:[a-z0-9-]+$/

const toIdentifier = (kebab) =>
  kebab
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')

const files = []
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.includes('icon-registry')) files.push(p)
  }
}
walk(srcDir)

const problems = []
const report = (msg) => problems.push(msg)

let totalReplaced = 0
let totalIcons = 0

for (const file of files.sort()) {
  const rel = path.relative(srcDir, file).replace(/\\/g, '/')
  if (SKIP.has(rel)) continue

  const text = fs.readFileSync(file, 'utf8')
  const isTsx = rel.endsWith('.tsx')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS)

  const edits = [] // {start, end, text}
  const usedIcons = new Map() // identifier -> spec
  const claimed = [] // [start, end) ranges

  const isClaimed = (start, end) => claimed.some(([s, e]) => start >= s && end <= e)

  const recordIcon = (spec) => {
    const id = toIdentifier(spec)
    if (!usedIcons.has(spec) && [...usedIcons.keys()].some((k) => toIdentifier(k) === id)) {
      report(`${rel}: identifier collision for '${spec}'`)
    }
    usedIcons.set(spec, id)
    return id
  }

  const addEdit = (start, end, replacement) => {
    if (edits.some((x) => start < x.end && end > x.start)) {
      report(`${rel}: overlapping edit at ${start}`)
      return
    }
    edits.push({ start, end, text: replacement })
  }

  // --- gather top-level imports ---
  const imports = sf.statements.filter(ts.isImportDeclaration)
  const iconImport = imports.find((s) => s.moduleSpecifier.getText(sf).replaceAll("'", '"') === `"${ICON_IMPORT_MODULE}"`)
  const otherImports = imports.filter((s) => s !== iconImport)
  const lastImportEnd = otherImports.length ? otherImports[otherImports.length - 1].getEnd() : 0
  const needsCn = () => text.includes('cn(') || /from '\/@\/lib\/utils'/.test(text) || text.includes("from '@/lib/utils'")

  // --- JSX Icon elements ---
  const jsxIconAttr = (element) => {
    const props = element.attributes.properties
    if (!props.every(ts.isJsxAttribute)) {
      report(`${rel}: Icon has spread attributes`)
      return null
    }
    const out = {}
    for (const p of props) {
      const name = p.name.getText(sf)
      const init = p.initializer
      if (!init) {
        out[name] = { kind: 'none' }
      } else if (ts.isStringLiteral(init)) {
        out[name] = { kind: 'string', value: init.text, node: init }
      } else if (ts.isJsxExpression(init)) {
        const e = init.expression
        if (!e) {
          out[name] = { kind: 'empty' }
        } else if (ts.isNumericLiteral(e)) {
          out[name] = { kind: 'number', value: e.text, node: e }
        } else if (ts.isConditionalExpression(e)) {
          out[name] = { kind: 'cond', node: e, whenTrue: e.whenTrue, whenFalse: e.whenFalse }
        } else {
          out[name] = { kind: 'expr', node: e, text: e.getText(sf) }
        }
      } else {
        report(`${rel}: unexpected initializer for ${name}`)
        return null
      }
    }
    return out
  }

  const stringSpec = (node) => {
    if (!node) return null
    if (ts.isStringLiteral(node) && LUCIDE_RE.test(node.text)) return node.text.slice(7)
    return null
  }

  const buildAttrs = (width, classNameInit) => {
    const attrs = [`width={${width}}`, `height={${width}}`]
    if (!classNameInit || classNameInit.kind === 'none' || classNameInit.kind === 'empty') {
      attrs.push(`className="shrink-0"`)
      return attrs
    }
    if (classNameInit.kind === 'string') {
      const v = classNameInit.value
      attrs.push(`className="shrink-0${v ? ` ${v}` : ''}"`)
      return attrs
    }
    // expression
    const raw = classNameInit.text
    if (/^cn\(/.test(raw)) {
      const inner = raw.slice(3, raw.length - 1)
      attrs.push(`className={cn('shrink-0', ${inner})}`)
    } else {
      attrs.push(`className={cn('shrink-0', ${raw})}`)
    }
    return attrs
  }

  const handleIconElement = (element) => {
    const attrs = jsxIconAttr(element)
    if (!attrs) return
    const unknown = Object.keys(attrs).filter((k) => !['icon', 'width', 'height', 'className'].includes(k))
    if (unknown.length) {
      report(`${rel}: Icon has unexpected attrs [${unknown}] — manual fix`)
      return
    }

    const widthAttr = attrs.width
    let width = 18 // legacy default
    if (widthAttr && widthAttr.kind === 'number') width = widthAttr.value
    else if (widthAttr) {
      report(`${rel}: Icon width is not numeric — manual fix`)
      return
    }
    if (attrs.height) {
      report(`${rel}: Icon already has height — manual fix`)
      return
    }

    const buildElement = (spec) => {
      const id = recordIcon(spec)
      const tag = ts.isJsxSelfClosingElement(element) ? id : id // tag name
      return `<${tag} ${buildAttrs(width, attrs.className).join(' ')} />`
    }

    const iconAttr = attrs.icon
    let replacement = null

    if (iconAttr && iconAttr.kind === 'string') {
      const spec = stringSpec(iconAttr.node)
      if (!spec) {
        report(`${rel}: Icon with non-lucide string — manual fix`)
        return
      }
      replacement = buildElement(spec)
    } else if (iconAttr && iconAttr.kind === 'cond') {
      const a = stringSpec(iconAttr.whenTrue)
      const b = stringSpec(iconAttr.whenFalse)
      if (!a || !b) {
        report(`${rel}: Icon conditional is not two lucide strings — manual fix`)
        return
      }
      const idA = recordIcon(a)
      const idB = recordIcon(b)
      const cls = buildAttrs(width, attrs.className).join(' ')
      replacement = `{${iconAttr.node.getText(sf)} ? <${idA} ${cls} /> : <${idB} ${cls} />}`
    } else if (iconAttr && iconAttr.kind === 'expr') {
      const raw = iconAttr.text
      if (/^[A-Za-z_$][\w$]*$/.test(raw)) {
        // lowercase identifier prop (EmptyState/StatCard/ChoiceCard) — skip, handled manually
        report(`${rel}: Icon with identifier '${raw}' — needs manual handling`)
        return
      }
      if (raw.includes('.')) {
        // member expression: <item.icon /> is valid JSX
        const cls = buildAttrs(width, attrs.className).join(' ')
        replacement = `<${raw} ${cls} />`
      } else {
        report(`${rel}: Icon with complex expression — manual fix`)
        return
      }
    } else {
      report(`${rel}: Icon missing icon attribute`)
      return
    }

    const start = element.getStart(sf)
    const end = element.getEnd()
    claimed.push([start, end])
    addEdit(start, end, replacement)
    totalReplaced += 1
  }

  // --- visit ---
  const visit = (node) => {
    if (ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf)
      if (tag === 'Icon' || tag.endsWith('.Icon')) handleIconElement(node)
    } else if (ts.isJsxElement(node) && node.openingElement) {
      const tag = node.openingElement.tagName.getText(sf)
      if (tag === 'Icon' || tag.endsWith('.Icon')) {
        report(`${rel}: non-self-closing <Icon> at line ${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1} — manual fix`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  // --- remaining lucide string literals (object props, other JSX attrs) ---
  const stringVisit = (node) => {
    if (ts.isStringLiteral(node) && LUCIDE_RE.test(node.text)) {
      const start = node.getStart(sf)
      const end = node.getEnd()
      if (isClaimed(start, end)) return
      const spec = node.text.slice(7)
      const id = recordIcon(spec)
      totalIcons += 1
      const parent = node.parent
      if (ts.isJsxAttribute(parent) && parent.name.getText(sf) === 'icon') {
        addEdit(start - 1, end + 1, `{${id}}`) // include JSX quotes: icon="x" -> icon={id}
      } else if (ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) {
        addEdit(start, end, id)
      } else {
        report(`${rel}: unhandled lucide string in ${ts.SyntaxKind[parent.kind]} at line ${sf.getLineAndCharacterOfPosition(start).line + 1}`)
      }
    }
    ts.forEachChild(node, stringVisit)
  }
  stringVisit(sf)

  if (!edits.length && !iconImport) continue

  // --- import rewrite ---
  if (iconImport) {
    let delStart = iconImport.getStart(sf)
    let delEnd = iconImport.getEnd()
    // consume the trailing line ending
    if (text[delEnd] === '\r' && text[delEnd + 1] === '\n') delEnd += 2
    else if (text[delEnd] === '\n') delEnd += 1
    addEdit(delStart, delEnd, '')
  }

  const iconImports = [...usedIcons.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([spec, id]) => `import ${id} from '~icons/lucide/${spec}'`)
  totalIcons += iconImports.length

  if (iconImports.length && lastImportEnd > 0) {
    addEdit(lastImportEnd, lastImportEnd, `\n${iconImports.join('\n')}`)
  } else if (iconImports.length) {
    addEdit(0, 0, `${iconImports.join('\n')}\n`)
  }

  // --- apply ---
  edits.sort((a, b) => b.start - a.start)
  let out = text
  for (const e of edits) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end)
  }
  out = out.replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n')

  fs.writeFileSync(file, out)
}

console.log(`[codemod] icon elements replaced: ${totalReplaced}`)
console.log(`[codemod] icon imports generated: ${totalIcons}`)
if (problems.length) {
  console.log(`\n[codemod] NEEDS ATTENTION (${problems.length}):`)
  for (const p of problems) console.log(' - ' + p)
}
