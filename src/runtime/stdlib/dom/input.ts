export function input(type?: HTMLInputElement["type"]): HTMLInputElement {
  const input = document.createElement("input");
  if (type != null) input.type = type;
  return input;
}
