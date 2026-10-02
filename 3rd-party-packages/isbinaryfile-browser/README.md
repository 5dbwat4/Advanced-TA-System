# isbinaryfile-browser

[isbinaryfile](https://github.com/gjtorikian/isBinaryFile) 的浏览器移植版，基于 **v5.0.2**。

原库在模块顶层 `require('fs')`/`require('util')`，无法在浏览器（Vite/Rollup/esbuild）中直接使用。
本包保留其判定算法，改为纯浏览器实现。

## 与原版的差异

- 无任何 Node.js 内置模块依赖（不再需要 `fs`/`path`/`Buffer`）
- 输入仅支持 `Uint8Array` 或 `ArrayBuffer`；传入文件路径（`string`）会抛出 `TypeError`
- 仅提供 ESM 入口，附带 TypeScript 类型
- 判定逻辑与原版一致：各类 BOM、`%PDF-` 魔数、UTF-8 多字节序列感知、
  可疑字节占比 > 10% 判为二进制，以及 Protobuf 试探

## 用法

```js
import { isBinaryFile, isBinaryFileSync } from 'isbinaryfile-browser'

isBinaryFileSync(new Uint8Array([0x00, 0x01])) // true
await isBinaryFile(new Uint8Array([0x68, 0x69])) // false
```

本地安装（monorepo 内）：

```bash
pnpm add file:../3rd-party-packages/isbinaryfile-browser
```

## 许可证

沿用原项目 MIT 许可证，见 [LICENSE](./LICENSE)，版权归原作者 Garen J. Torikian 所有。

---

以下为原项目 README。

# isBinaryFile

Detects if a file is binary in Node.js using ✨promises✨. Similar to [Perl's `-B` switch](http://stackoverflow.com/questions/899206/how-does-perl-know-a-file-is-binary), in that:
- it reads the first few thousand bytes of a file
- checks for a `null` byte; if it's found, it's binary
- flags non-ASCII characters. After a certain number of "weird" characters, the file is flagged as binary

Much of the logic is pretty much ported from [ag](https://github.com/ggreer/the_silver_searcher).

Note: if the file doesn't exist or is a directory, an error is thrown.

## Installation

```
npm install isbinaryfile
```

## Usage

Returns `Promise<boolean>` (or just `boolean` for `*Sync`). `true` if the file is binary, `false` otherwise.

### isBinaryFile(filepath)

* `filepath` -  a `string` indicating the path to the file.

### isBinaryFile(bytes[, size])

* `bytes` - a `Buffer` of the file's contents.
* `size` - an optional `number` indicating the file size.

### isBinaryFileSync(filepath)

* `filepath` - a `string` indicating the path to the file.


### isBinaryFileSync(bytes[, size])

* `bytes` - a `Buffer` of the file's contents.
* `size` - an optional `number` indicating the file size.

### Examples

Here's an arbitrary usage:

```javascript
const isBinaryFile = require("isbinaryfile").isBinaryFile;
const fs = require("fs");

const filename = "fixtures/pdf.pdf";
const data = fs.readFileSync(filename);
const stat = fs.lstatSync(filename);

isBinaryFile(data, stat.size).then((result) => {
  if (result) {
    console.log("It is binary!")
  }
  else {
    console.log("No it is not.")
  }
});

const isBinaryFileSync = require("isbinaryfile").isBinaryFileSync;
const bytes = fs.readFileSync(filename);
const size = fs.lstatSync(filename).size;
console.log(isBinaryFileSync(bytes, size)); // true or false
```

## Testing

Run `npm install`, then run `npm test`.
