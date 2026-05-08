import {when} from "./when.js";

/** @deprecated */
export function tick<T>(duration: number, value: T): Promise<T> {
  return when(Math.ceil((Date.now() + 1) / duration) * duration, value);
}
