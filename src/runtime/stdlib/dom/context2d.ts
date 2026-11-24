/** @deprecated */
export function context2d(
  width: number,
  height: number,
  dpi = devicePixelRatio
): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = width * dpi;
  canvas.height = height * dpi;
  canvas.style.width = `${width}px`;
  const context = canvas.getContext("2d")!;
  context.scale(dpi, dpi);
  return context;
}
