// [browser-port] Type-only copy of isbinaryfile 6.0.0: Buffer -> Uint8Array.
/**
 * Encoding hints to improve text detection accuracy for non-UTF-8 files.
 */
export type EncodingHint = 'utf-16' | 'utf-16le' | 'utf-16be' | 'latin1' | 'iso-8859-1' | 'cjk' | 'big5' | 'gb2312' | 'gbk' | 'euc-kr' | 'shift-jis';
/**
 * Detect UTF-16 without BOM by analyzing null byte patterns.
 * UTF-16LE: ASCII chars have nulls at odd positions (e.g., 't\0e\0s\0t\0')
 * UTF-16BE: ASCII chars have nulls at even positions (e.g., '\0t\0e\0s\0t')
 */
// [browser-port] Buffer -> Uint8Array
export declare function detectUtf16NoBom(fileBuffer: Uint8Array, bytesRead: number): 'utf-16le' | 'utf-16be' | null;
/**
 * Check if the buffer is valid text for the given encoding hint.
 * Returns true if it's valid text (not binary), false if binary.
 */
// [browser-port] Buffer -> Uint8Array
export declare function isTextWithEncodingHint(fileBuffer: Uint8Array, bytesRead: number, encoding: EncodingHint): boolean;
