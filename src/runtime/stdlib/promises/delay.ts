/** @deprecated */
export function delay(duration: number): Promise<void>;
/** @deprecated */
export function delay<T>(duration: number, value: T): Promise<T>;
export function delay<T>(duration: number, value?: T): Promise<T | void> {
  return new Promise((resolve) => setTimeout(() => resolve(value), duration));
}
