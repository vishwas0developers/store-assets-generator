/** three.js's GLTFExporter/GLTFLoader assume a few browser globals even for
 *  headless, textureless use (binary assembly reads a Blob via FileReader).
 *  This is CPU-only glue, not a GPU shim — no renderer/canvas involved.
 *  Call once before using GLTFExporter/GLTFLoader from Node. Idempotent. */
export function ensureGltfNodeEnv(): void {
  if (typeof (globalThis as any).FileReader === "undefined") {
    (globalThis as any).FileReader = class FileReader {
      result: ArrayBuffer | string | null = null;
      onloadend: (() => void) | null = null;
      onerror: ((err: unknown) => void) | null = null;
      readAsArrayBuffer(blob: Blob): void {
        blob
          .arrayBuffer()
          .then((buf) => {
            this.result = buf;
            this.onloadend?.();
          })
          .catch((err) => this.onerror?.(err));
      }
    };
  }
}
