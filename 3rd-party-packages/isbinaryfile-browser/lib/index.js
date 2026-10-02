// [browser-port] Browser port of isbinaryfile 6.0.0 (MIT, https://github.com/gjtorikian/isBinaryFile).
// [browser-port] Only divergence: file paths are unsupported; pass a Uint8Array. Every change is marked [browser-port].
import { detectUtf16NoBom, isTextWithEncodingHint } from './encoding.js';
const MAX_BYTES = 512;
const UTF8_BOUNDARY_RESERVE = 3;
// A very basic non-exception raising reader. Read bytes and
// at the end use hasError() to check whether this worked.
class Reader {
    fileBuffer;
    size;
    offset;
    error;
    constructor(fileBuffer, size) {
        this.fileBuffer = fileBuffer;
        this.size = size;
        this.offset = 0;
        this.error = false;
    }
    hasError() {
        return this.error;
    }
    nextByte() {
        if (this.offset === this.size || this.hasError()) {
            this.error = true;
            return 0xff;
        }
        return this.fileBuffer[this.offset++];
    }
    next(len) {
        // Prevent massive array allocation by checking bounds first
        if (len < 0 || len > this.size - this.offset) {
            this.error = true;
            return [];
        }
        const n = new Array();
        for (let i = 0; i < len; i++) {
            // Stop reading if an error occurred
            if (this.error) {
                return n;
            }
            n[i] = this.nextByte();
        }
        return n;
    }
}
// Read a Google Protobuf var(iable)int from the buffer.
function readProtoVarInt(reader) {
    let idx = 0;
    let varInt = 0;
    while (!reader.hasError()) {
        const b = reader.nextByte();
        varInt = varInt | ((b & 0x7f) << (7 * idx));
        if ((b & 0x80) === 0) {
            break;
        }
        if (idx >= 10) {
            // Varint can be between 1 and 10 bytes. This is too large.
            reader.error = true;
            break;
        }
        idx++;
    }
    return varInt;
}
// Attempt to taste a full Google Protobuf message.
function readProtoMessage(reader) {
    const varInt = readProtoVarInt(reader);
    const wireType = varInt & 0x7;
    switch (wireType) {
        case 0:
            readProtoVarInt(reader);
            return true;
        case 1:
            reader.next(8);
            return true;
        case 2:
            const len = readProtoVarInt(reader);
            reader.next(len);
            return true;
        case 5:
            reader.next(4);
            return true;
    }
    return false;
}
// Check whether this seems to be a valid protobuf file.
function isBinaryProto(fileBuffer, totalBytes) {
    const reader = new Reader(fileBuffer, totalBytes);
    let numMessages = 0;
    while (true) {
        // Definitely not a valid protobuf
        if (!readProtoMessage(reader) && !reader.hasError()) {
            return false;
        }
        // Short read?
        if (reader.hasError()) {
            break;
        }
        numMessages++;
    }
    return numMessages > 0;
}
export async function isBinaryFile(file, options) {
    if (isString(file)) {
        // [browser-port] no node:fs - paths cannot be read in a browser
        throw new TypeError('isbinaryfile-browser: expected a Uint8Array, got a string');
    }
    else {
        const size = options?.size !== undefined ? options.size : file.length;
        return isBinaryCheck(file, size, options);
    }
}
export function isBinaryFileSync(file, options) {
    if (isString(file)) {
        // [browser-port] no node:fs - paths cannot be read in a browser
        throw new TypeError('isbinaryfile-browser: expected a Uint8Array, got a string');
    }
    else {
        const size = options?.size !== undefined ? options.size : file.length;
        return isBinaryCheck(file, size, options);
    }
}
function isBinaryCheck(fileBuffer, bytesRead, options) {
    // empty file. no clue what it is.
    if (bytesRead === 0) {
        return false;
    }
    let suspiciousBytes = 0;
    const totalBytes = Math.min(bytesRead, MAX_BYTES + UTF8_BOUNDARY_RESERVE);
    const scanBytes = Math.min(totalBytes, MAX_BYTES);
    // UTF-8 BOM
    if (bytesRead >= 3 && fileBuffer[0] === 0xef && fileBuffer[1] === 0xbb && fileBuffer[2] === 0xbf) {
        return false;
    }
    // UTF-32 BOM
    if (bytesRead >= 4 &&
        fileBuffer[0] === 0x00 &&
        fileBuffer[1] === 0x00 &&
        fileBuffer[2] === 0xfe &&
        fileBuffer[3] === 0xff) {
        return false;
    }
    // UTF-32 LE BOM
    if (bytesRead >= 4 &&
        fileBuffer[0] === 0xff &&
        fileBuffer[1] === 0xfe &&
        fileBuffer[2] === 0x00 &&
        fileBuffer[3] === 0x00) {
        return false;
    }
    // GB BOM
    if (bytesRead >= 4 &&
        fileBuffer[0] === 0x84 &&
        fileBuffer[1] === 0x31 &&
        fileBuffer[2] === 0x95 &&
        fileBuffer[3] === 0x33) {
        return false;
    }
    // [browser-port] Uint8Array has no Buffer#toString; result is identical for the ASCII '%PDF-' header
    if (totalBytes >= 5 && String.fromCharCode(...fileBuffer.slice(0, 5)) === '%PDF-') {
        /* PDF. This is binary. */
        return true;
    }
    // UTF-16 BE BOM
    if (bytesRead >= 2 && fileBuffer[0] === 0xfe && fileBuffer[1] === 0xff) {
        return false;
    }
    // UTF-16 LE BOM
    if (bytesRead >= 2 && fileBuffer[0] === 0xff && fileBuffer[1] === 0xfe) {
        return false;
    }
    // Handle encoding hints - if provided, use specialized validation
    if (options?.encoding) {
        return !isTextWithEncodingHint(fileBuffer, bytesRead, options.encoding);
    }
    // Auto-detect UTF-16 without BOM by analyzing null byte patterns
    const utf16Detected = detectUtf16NoBom(fileBuffer, bytesRead);
    if (utf16Detected) {
        // Detected UTF-16 pattern, validate as text
        return !isTextWithEncodingHint(fileBuffer, bytesRead, utf16Detected);
    }
    for (let i = 0; i < scanBytes; i++) {
        if (fileBuffer[i] === 0) {
            // NULL byte--it's binary!
            return true;
        }
        else if ((fileBuffer[i] < 7 || fileBuffer[i] > 14) && (fileBuffer[i] < 32 || fileBuffer[i] > 127)) {
            // UTF-8 detection
            if (fileBuffer[i] >= 0xc0 && fileBuffer[i] <= 0xdf && i + 1 < totalBytes) {
                i++;
                if (fileBuffer[i] >= 0x80 && fileBuffer[i] <= 0xbf) {
                    continue;
                }
            }
            else if (fileBuffer[i] >= 0xe0 && fileBuffer[i] <= 0xef && i + 2 < totalBytes) {
                i++;
                if (fileBuffer[i] >= 0x80 && fileBuffer[i] <= 0xbf && fileBuffer[i + 1] >= 0x80 && fileBuffer[i + 1] <= 0xbf) {
                    i++;
                    continue;
                }
            }
            else if (fileBuffer[i] >= 0xf0 && fileBuffer[i] <= 0xf7 && i + 3 < totalBytes) {
                i++;
                if (fileBuffer[i] >= 0x80 &&
                    fileBuffer[i] <= 0xbf &&
                    fileBuffer[i + 1] >= 0x80 &&
                    fileBuffer[i + 1] <= 0xbf &&
                    fileBuffer[i + 2] >= 0x80 &&
                    fileBuffer[i + 2] <= 0xbf) {
                    i += 2;
                    continue;
                }
            }
            suspiciousBytes++;
            // Read at least 32 fileBuffer before making a decision
            if (i >= 32 && (suspiciousBytes * 100) / scanBytes > 10) {
                return true;
            }
        }
    }
    if ((suspiciousBytes * 100) / scanBytes > 10) {
        return true;
    }
    if (suspiciousBytes > 1 && isBinaryProto(fileBuffer, scanBytes)) {
        return true;
    }
    return false;
}
function isString(x) {
    return typeof x === 'string';
}
function isStatFile(stat) {
    if (!stat.isFile()) {
        throw new Error(`Path provided was not a file!`);
    }
}
