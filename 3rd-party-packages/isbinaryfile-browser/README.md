# isbinaryfile-browser

[isbinaryfile](https://github.com/gjtorikian/isBinaryFile) **6.0.0** 的浏览器移植版（minimal fork）。

与原版的差异仅限必要的 IO 部分，其余逐行一致，所有改动都标有 `[browser-port]` 注释：

- 删除 `node:fs` / `node:fs/promises` 导入（浏览器无法使用）
- 不再支持文件路径：传入 `string` 会抛 `TypeError`，请传 `Uint8Array`（如 `new Uint8Array(await blob.arrayBuffer())`）
- `%PDF-` 魔数判断由 `Buffer#toString` 改为等价的 `String.fromCharCode`
- 类型定义中 `string | Buffer` 改为 `Uint8Array`
- `lib/encoding.js` 与原版完全一致（本就不依赖 Node）

## 用法

```js
import { isBinaryFile, isBinaryFileSync } from 'isbinaryfile-browser'

const bytes = new Uint8Array(await blob.arrayBuffer())
isBinaryFileSync(bytes) // true = 二进制
await isBinaryFile(bytes) // 异步版本
```

`options.size`、`options.encoding` 编码提示（`utf-16`、`latin1`、`gbk` 等）与原版一致。

本地安装（monorepo 内）：

```bash
pnpm add file:../3rd-party-packages/isbinaryfile-browser
```

## 许可证

MIT，版权归原作者 Garen J. Torikian 所有，见 [LICENSE](./LICENSE)。

---

以下为 isbinaryfile 6.0.0 原版 README。

# isBinaryFile

Detects if a file is binary in Node.js. Similar to [Perl's `-B` switch](http://stackoverflow.com/questions/899206/how-does-perl-know-a-file-is-binary), in that:

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

### isBinaryFile(filepath[, options])

- `filepath` - a `string` indicating the path to the file.
- `options` - an optional object with the following properties:
  - `encoding` - an encoding hint (see [Encoding Hints](#encoding-hints) below)

### isBinaryFile(bytes[, options])

- `bytes` - a `Buffer` of the file's contents.
- `options` - an optional object with the following properties:
  - `size` - the size of the buffer (defaults to `bytes.length`)
  - `encoding` - an encoding hint (see [Encoding Hints](#encoding-hints) below)

### isBinaryFileSync(filepath[, options])

Synchronous version of `isBinaryFile`.

### isBinaryFileSync(bytes[, options])

Synchronous version of `isBinaryFile` for buffers.

### Examples

Here's an arbitrary usage:

```javascript
import { isBinaryFile, isBinaryFileSync } from 'isbinaryfile';
import fs from 'fs';

const filename = 'fixtures/pdf.pdf';

// Async with file path
const result = await isBinaryFile(filename);
if (result) {
  console.log('It is binary!');
} else {
  console.log('No it is not.');
}

// Sync with buffer
const bytes = fs.readFileSync(filename);
console.log(isBinaryFileSync(bytes)); // true or false

// With explicit size option
const partialBuffer = Buffer.alloc(100);
fs.readSync(fs.openSync(filename, 'r'), partialBuffer, 0, 100, 0);
console.log(isBinaryFileSync(partialBuffer, { size: 100 }));
```

### Encoding Hints

For files that use non-UTF-8 encodings, you can provide encoding hints to improve detection accuracy:

```javascript
import { isBinaryFile, isBinaryFileSync } from 'isbinaryfile';

// UTF-16 files without BOM are auto-detected in most cases
const result1 = await isBinaryFile('utf16-file.txt');

// Or provide explicit encoding hint
const result2 = await isBinaryFile('utf16-file.txt', { encoding: 'utf-16' });

// ISO-8859-1 / Latin-1 encoded files
const result3 = isBinaryFileSync('german-text.txt', { encoding: 'latin1' });

// CJK encoded files (Big5, GB2312, EUC-KR, etc.)
const result4 = isBinaryFileSync('chinese-big5.txt', { encoding: 'big5' });
const result5 = isBinaryFileSync('korean-text.txt', { encoding: 'euc-kr' });

// Generic CJK hint when exact encoding is unknown
const result6 = isBinaryFileSync('asian-text.txt', { encoding: 'cjk' });
```

#### Supported Encoding Hints

| Hint         | Description                                |
| ------------ | ------------------------------------------ |
| `utf-16`     | UTF-16 (auto-detect endianness)            |
| `utf-16le`   | UTF-16 Little Endian                       |
| `utf-16be`   | UTF-16 Big Endian                          |
| `latin1`     | ISO-8859-1 / Latin-1                       |
| `iso-8859-1` | Alias for latin1                           |
| `cjk`        | Generic CJK (use when encoding is unknown) |
| `big5`       | Traditional Chinese                        |
| `gb2312`     | Simplified Chinese                         |
| `gbk`        | Extended GB2312                            |
| `euc-kr`     | Korean                                     |
| `shift-jis`  | Japanese                                   |

**Note:** UTF-16 without BOM is automatically detected in most cases without needing a hint.

## Testing

Run `npm test`.
