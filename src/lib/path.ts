/**
 * Returns the normalized POSIX path, resolving "." and ".." segments and
 * collapsing repeated slashes; equivalent to node:path/posix.
 */
export function normalize(path: string): string {
  if (path === "") return ".";
  const absolute = path.startsWith("/");
  const trailing = path.endsWith("/");
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length > 0 && parts[parts.length - 1] !== "..") parts.pop();
      else if (!absolute) parts.push("..");
    } else {
      parts.push(part);
    }
  }
  const result = parts.join("/");
  if (absolute) return `/${result}${result && trailing ? "/" : ""}`;
  if (!result) return trailing ? "./" : ".";
  return trailing ? `${result}/` : result;
}
