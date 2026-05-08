const timeouts = new Map<number, Promise<void>>();

/** @deprecated */
export async function when<T>(time: number, value: T): Promise<T> {
  let timeout = timeouts.get((time = +time));
  if (!timeout) {
    const now = Date.now();
    const delay = time - now;
    if (delay > 0) {
      if (delay > 0x7fffffff) throw new Error("too long to wait");
      timeout = new Promise<void>((resolve) => setTimeout(resolve, delay));
      timeout.then(() => timeouts.delete(time));
      timeouts.set(time, timeout);
    }
  }
  await timeout;
  return value;
}
