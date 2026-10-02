export type BinaryInput = Uint8Array | ArrayBuffer

/**
 * Returns `true` if the given bytes look like a binary file, `false` otherwise.
 * Browser port of `isbinaryfile`; file paths are not supported.
 */
export declare function isBinaryFile(file: BinaryInput, size?: number): Promise<boolean>

/**
 * Synchronous variant of {@link isBinaryFile}.
 */
export declare function isBinaryFileSync(file: BinaryInput, size?: number): boolean
