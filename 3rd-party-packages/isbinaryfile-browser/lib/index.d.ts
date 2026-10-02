// [browser-port] Type-only copy of isbinaryfile 6.0.0: Buffer -> Uint8Array.
import type { EncodingHint } from './encoding.js';
export { EncodingHint } from './encoding.js';
/**
 * Options for binary file detection.
 */
export interface IsBinaryOptions {
    /**
     * Hint about expected encoding to avoid false positives.
     */
    encoding?: EncodingHint;
    /**
     * Size of the input (defaults to its length).
     */
    size?: number;
}
// [browser-port] string | Buffer -> Uint8Array
export declare function isBinaryFile(file: Uint8Array, options?: IsBinaryOptions): Promise<boolean>;
export declare function isBinaryFileSync(file: Uint8Array, options?: IsBinaryOptions): boolean;
