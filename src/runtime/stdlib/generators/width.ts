import {observe} from "./observe.js";

export function width(target: Element, options?: ResizeObserverOptions) {
  return observe<number>((notify) => {
    let width: number;
    const observer = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w !== width) notify((width = w));
    });
    observer.observe(target, options);
    return () => observer.disconnect();
  });
}
