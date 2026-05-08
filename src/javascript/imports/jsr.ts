/** If specifier is a jsr: protocol import, resolves it. */
export function resolveJsrImport(specifier: string): string {
  if (!specifier.startsWith("jsr:")) return specifier;
  return `https://esm.sh/jsr/${specifier.slice(4)}`;
}
