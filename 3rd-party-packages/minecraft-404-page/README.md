# minecraft-404-page

一个 **React** 版的 Minecraft 主题 404 页面：three.js 体素（voxel）场景，居中用方块堆出
“404”，可拖拽旋转，左键放置方块、右键移除方块。

移植自一份社区 Vue 3 + Vite 的 Minecraft 主题 404 示例，改写为 React 组件 + 纯 ESM 模块，
并把所需的 three.js 构建产物内联（vendored）进来，作为自包含包使用。

## 用法

```tsx
import { Minecraft404 } from 'minecraft-404-page'

export default function NotFound() {
  const [ready, setReady] = useState(false)
  return (
    <div className="relative aspect-video w-full">
      <Minecraft404 className="h-full w-full" onReady={() => setReady(true)} />
      {!ready && <Spinner />}
    </div>
  )
}
```

组件渲染一个撑满父容器的 `<div>`，并在其中创建 `<canvas>`；父容器需要有确定尺寸
（宽高 100%、固定值或 `aspect-*`），否则画布尺寸为 0。

| Prop | 说明 |
| --- | --- |
| `className` / `style` | 作用于外层容器 |
| `onReady` | 场景构建完成且已绘制第一帧后触发一次，可用于隐藏 loading |

本地安装（monorepo 内，与 `isbinaryfile-browser` 一致）：

```bash
pnpm add file:../3rd-party-packages/minecraft-404-page
```

## 结构

```
src/
  index.js         React 组件（用 createElement 编写，避免依赖 JSX 编译）
  scene.js         场景 / 光照 / 交互 / 渲染循环，导出 createScene(canvas) -> dispose()
  VoxelWorld.js    体素存储 + 面剔除 + 射线求交（与 three.js voxel 示例一致）
  textLayout.js    “404” 字形与地台的体素布局
  textures.js      由 assets/*.png 生成的贴图 URL 清单（自动生成，勿手改）
  vendor/          内联的 three.js（three.module.js / three.core.js / OrbitControls.js）
  assets/*.png     139 张 16×16 方块贴图
```

贴图经 Vite 以资源 URL 方式导入（`import url from './assets/x.png'`），在运行时汇总成
一张 canvas 贴图图集（texture atlas）。新增贴图后重新生成 `textures.js` 即可。

## 说明

- 相对原示例去掉了天空色与雾效：画布背景透明，直接融入所在页面的底色。
- 组件在 React StrictMode 下会挂载两次；`createScene` 返回的 `dispose()` 会释放渲染器、
  几何体、贴图、事件监听与动画帧，因此可安全地重复挂载/卸载。
- 仅支持浏览器环境（依赖 WebGL 与 Canvas 2D）。
- 方块类型与地表方块为随机生成，每次进入场景的方块分布都不同。

## 许可证

- `src/vendor/*`：three.js，MIT（见各文件头部 `@license` 声明）。
- 其余移植代码：来自对应社区示例，遵循其原始许可。
