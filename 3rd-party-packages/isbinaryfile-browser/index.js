/**
 * Browser port of isbinaryfile v5.0.2 (MIT).
 * Original: https://github.com/gjtorikian/isBinaryFile
 * See README.md for the list of changes from the original.
 */

const MAX_BYTES = 512

/**
 * @param {Uint8Array | ArrayBuffer} file
 * @param {number} [size]
 * @returns {Promise<boolean>}
 */
export async function isBinaryFile(file, size) {
  if (typeof file === 'string') {
    throw new TypeError(
      'isbinaryfile-browser does not support file paths; pass a Uint8Array or ArrayBuffer',
    )
  }
  return isBinaryFileSync(file, size)
}

/**
 * @param {Uint8Array | ArrayBuffer} file
 * @param {number} [size]
 * @returns {boolean}
 */
export function isBinaryFileSync(file, size) {
  const bytes = toUint8Array(file)
  const totalBytes = Math.min(size ?? bytes.length, MAX_BYTES)
  return isBinaryCheck(bytes, totalBytes)
}

function toUint8Array(file) {
  if (file instanceof Uint8Array) return file
  if (file instanceof ArrayBuffer) return new Uint8Array(file)
  if (ArrayBuffer.isView(file)) {
    return new Uint8Array(file.buffer, file.byteOffset, file.byteLength)
  }
  throw new TypeError('isbinaryfile-browser expects a Uint8Array or ArrayBuffer')
}

// A very basic non-exception raising reader. Read bytes and
// at the end use hasError() to check whether this worked.
class ByteReader {
  constructor(buffer, size) {
    this.buffer = buffer
    this.size = size
    this.offset = 0
    this.error = false
  }

  hasError() {
    return this.error
  }

  nextByte() {
    if (this.offset === this.size || this.hasError()) {
      this.error = true
      return 0xff
    }
    return this.buffer[this.offset++]
  }

  next(length) {
    const result = []
    for (let index = 0; index < length; index++) {
      result[index] = this.nextByte()
    }
    return result
  }
}

// Read a Google Protobuf var(iable)int from the buffer.
function readProtoVarInt(reader) {
  let index = 0
  let varInt = 0
  while (!reader.hasError()) {
    const byte = reader.nextByte()
    varInt = varInt | ((byte & 0x7f) << (7 * index))
    if ((byte & 0x80) === 0) {
      break
    }
    index++
  }
  return varInt
}

// Attempt to taste a full Google Protobuf message.
function readProtoMessage(reader) {
  const varInt = readProtoVarInt(reader)
  const wireType = varInt & 0x7
  switch (wireType) {
    case 0:
      readProtoVarInt(reader)
      return true
    case 1:
      reader.next(8)
      return true
    case 2: {
      const length = readProtoVarInt(reader)
      reader.next(length)
      return true
    }
    case 5:
      reader.next(4)
      return true
    default:
      return false
  }
}

// Check whether this seems to be a valid protobuf file.
function isBinaryProto(fileBuffer, totalBytes) {
  const reader = new ByteReader(fileBuffer, totalBytes)
  let numMessages = 0
  while (true) {
    // Definitely not a valid protobuf
    if (!readProtoMessage(reader) && !reader.hasError()) {
      return false
    }
    // Short read?
    if (reader.hasError()) {
      break
    }
    numMessages++
  }
  return numMessages > 0
}

function isBinaryCheck(fileBuffer, bytesRead) {
  // empty file. no clue what it is.
  if (bytesRead === 0) {
    return false
  }

  let suspiciousBytes = 0
  const totalBytes = Math.min(bytesRead, MAX_BYTES)

  // UTF-8 BOM
  if (bytesRead >= 3 && fileBuffer[0] === 0xef && fileBuffer[1] === 0xbb && fileBuffer[2] === 0xbf) {
    return false
  }
  // UTF-32 BOM
  if (
    bytesRead >= 4 &&
    fileBuffer[0] === 0x00 &&
    fileBuffer[1] === 0x00 &&
    fileBuffer[2] === 0xfe &&
    fileBuffer[3] === 0xff
  ) {
    return false
  }
  // UTF-32 LE BOM
  if (
    bytesRead >= 4 &&
    fileBuffer[0] === 0xff &&
    fileBuffer[1] === 0xfe &&
    fileBuffer[2] === 0x00 &&
    fileBuffer[3] === 0x00
  ) {
    return false
  }
  // GB BOM
  if (
    bytesRead >= 4 &&
    fileBuffer[0] === 0x84 &&
    fileBuffer[1] === 0x31 &&
    fileBuffer[2] === 0x95 &&
    fileBuffer[3] === 0x33
  ) {
    return false
  }
  // %PDF-
  if (
    totalBytes >= 5 &&
    fileBuffer[0] === 0x25 &&
    fileBuffer[1] === 0x50 &&
    fileBuffer[2] === 0x44 &&
    fileBuffer[3] === 0x46 &&
    fileBuffer[4] === 0x2d
  ) {
    return true
  }
  // UTF-16 BE BOM
  if (bytesRead >= 2 && fileBuffer[0] === 0xfe && fileBuffer[1] === 0xff) {
    return false
  }
  // UTF-16 LE BOM
  if (bytesRead >= 2 && fileBuffer[0] === 0xff && fileBuffer[1] === 0xfe) {
    return false
  }

  for (let index = 0; index < totalBytes; index++) {
    if (fileBuffer[index] === 0) {
      // NULL byte--it's binary!
      return true
    } else if (
      (fileBuffer[index] < 7 || fileBuffer[index] > 14) &&
      (fileBuffer[index] < 32 || fileBuffer[index] > 127)
    ) {
      // UTF-8 detection
      if (fileBuffer[index] > 193 && fileBuffer[index] < 224 && index + 1 < totalBytes) {
        index++
        if (fileBuffer[index] > 127 && fileBuffer[index] < 192) {
          continue
        }
      } else if (fileBuffer[index] > 223 && fileBuffer[index] < 240 && index + 2 < totalBytes) {
        index++
        if (
          fileBuffer[index] > 127 &&
          fileBuffer[index] < 192 &&
          fileBuffer[index + 1] > 127 &&
          fileBuffer[index + 1] < 192
        ) {
          index++
          continue
        }
      }
      suspiciousBytes++
      // Read at least 32 fileBuffer before making a decision
      if (index >= 32 && (suspiciousBytes * 100) / totalBytes > 10) {
        return true
      }
    }
  }

  if ((suspiciousBytes * 100) / totalBytes > 10) {
    return true
  }
  if (suspiciousBytes > 1 && isBinaryProto(fileBuffer, totalBytes)) {
    return true
  }
  return false
}
