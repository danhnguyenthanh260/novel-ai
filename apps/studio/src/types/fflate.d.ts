declare module "fflate" {
  export function unzipSync(data: Uint8Array): Record<string, Uint8Array>;
  export function zipSync(data: Record<string, Uint8Array>): Uint8Array;
  export function strToU8(str: string): Uint8Array;
}
