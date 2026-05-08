/** @deprecated */
export function range(min?: number, max?: number, step?: number): HTMLInputElement {
  if (arguments.length === 1) {
    max = min;
    min = undefined;
  }
  const input = document.createElement("input");
  input.min = String((min = min == null ? 0 : +min));
  input.max = String((max = max == null ? 1 : +max));
  input.step = step == null ? "any" : String((step = +step));
  input.type = "range";
  return input;
}
