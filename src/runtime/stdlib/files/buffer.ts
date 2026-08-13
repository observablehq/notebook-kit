export function buffer(blob: Blob): Promise<ArrayBuffer> {
  return blob.arrayBuffer();
}
