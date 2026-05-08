/** @deprecated */
export function select(values: string[]): HTMLSelectElement {
  const select = document.createElement("select");
  for (const value of values) {
    const option = document.createElement("option");
    option.value = option.textContent = value;
    select.appendChild(option);
  }
  return select;
}
