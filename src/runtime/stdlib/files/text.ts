export function text(blob: Blob): Promise<string> {
  return blob.text();
}
