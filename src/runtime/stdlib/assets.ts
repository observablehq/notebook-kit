const SRC_SELECTOR = [
  "audio source[src]", // audio
  "audio[src]", // audio
  "img[src]", // images
  "picture source[src]", // images
  "video source[src]", // videos
  "video[src]" // videos
].join();

const SRCSET_SELECTOR = [
  "img[srcset]", // images
  "picture source[srcset]" // images
].join();

const HREF_SELECTOR = [
  "a[href][download]", // download links
  "link[href]" // stylesheets
].join();

const ASSET_ATTRIBUTES = [
  [SRC_SELECTOR, "src"],
  [SRCSET_SELECTOR, "srcset"],
  [HREF_SELECTOR, "href"]
];

/** Populates the asset keys from the specified root.  */
export function collectAssets(assets: Set<string>, root: Element): void {
  for (const [selector, name] of ASSET_ATTRIBUTES) {
    for (const element of root.querySelectorAll(selector)) {
      if (isRelExternal(element)) continue;
      const source = decodeURI(element.getAttribute(name)!);
      if (name === "srcset") {
        for (const s of parseSrcset(source)) {
          if (isSourcePath(s)) {
            assets.add(asImportPath(s));
          }
        }
      } else if (isSourcePath(source)) {
        assets.add(asImportPath(source));
      }
    }
  }
}

/** Mutates the specified root to apply the specified asset mapping. */
export function mapAssets(root: Element, assets: Map<string, string>): void {
  const resolve = (s: string) => assets.get(asImportPath(s)) ?? s;
  for (const [selector, src] of ASSET_ATTRIBUTES) {
    for (const element of root.querySelectorAll(selector)) {
      if (isRelExternal(element)) continue;
      const source = decodeURI(element.getAttribute(src)!);
      if (src === "srcset") element.setAttribute(src, resolveSrcset(source, resolve));
      else element.setAttribute(src, resolve(source));
    }
  }
}

/** Returns true if the specified element has rel=external. */
function isRelExternal(a: Element): boolean {
  return /(?:^|\s)external(?:\s|$)/i.test(a.getAttribute("rel") ?? ""); // e.g., <a href rel="external">
}

/** Strips the query string and anchor fragment from the specified source. */
function asPath(source: string): string {
  const i = source.indexOf("?");
  const j = source.indexOf("#");
  const k = i >= 0 && j >= 0 ? Math.min(i, j) : i >= 0 ? i : j;
  return k >= 0 ? source.slice(0, k) : source; // strip query string or anchor fragment
}

/** Converts the specified source into an import path, typically with ./. */
function asImportPath(source: string): string {
  const path = asPath(source);
  return isImportPath(path) ? path : `./${path}`;
}

/**
 * Returns true if the specified import specifier is a path, as opposed to a
 * bare module specifier or a URL; import paths start with ./, ../, or /.
 */
function isImportPath(specifier: string): boolean {
  return ["./", "../", "/"].some((prefix) => specifier.startsWith(prefix));
}

/**
 * Returns true if the specified source (such as an img element src attribute)
 * is a path; this is anything that is not empty and does not start with a
 * protocol or a hash.
 */
function isSourcePath(specifier: string): boolean {
  return asPath(specifier) ? !/^(\w+:|#)/.test(specifier) : false;
}

/** Parses the specified srcset attribute, returning the array of sources. */
function parseSrcset(srcset: string): string[] {
  return srcset
    .trim()
    .split(/\s*,\s*/)
    .filter((src) => src)
    .map((src) => src.split(/\s+/)[0]);
}

/** Resolves the specified srcset attribute, resolving any sources. */
function resolveSrcset(srcset: string, resolve: (src: string) => string): string {
  return srcset
    .trim()
    .split(/\s*,\s*/)
    .filter((src) => src)
    .map((src) => {
      const parts = src.split(/\s+/);
      const path = resolve(parts[0]);
      if (path) parts[0] = encodeURI(path);
      return parts.join(" ");
    })
    .join(", ");
}
