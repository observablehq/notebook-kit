const namespaces = {
  math: "http://www.w3.org/1998/Math/MathML",
  svg: "http://www.w3.org/2000/svg",
  xhtml: "http://www.w3.org/1999/xhtml",
  xlink: "http://www.w3.org/1999/xlink",
  xml: "http://www.w3.org/XML/1998/namespace",
  xmlns: "http://www.w3.org/2000/xmlns/"
};

function isNamespace(prefix: string): prefix is keyof typeof namespaces {
  return Object.prototype.hasOwnProperty.call(namespaces, prefix);
}

/** @deprecated */
export function element(name: string, attributes: Record<string, string>): Element {
  let prefix = (name += "");
  let i = prefix.indexOf(":");
  if (i >= 0 && (prefix = name.slice(0, i)) !== "xmlns") name = name.slice(i + 1);
  const element = isNamespace(prefix)
    ? document.createElementNS(namespaces[prefix], name)
    : document.createElement(name);
  if (attributes) {
    for (let key in attributes) {
      const value = attributes[key];
      i = (prefix = key).indexOf(":");
      if (i >= 0 && (prefix = key.slice(0, i)) !== "xmlns") key = key.slice(i + 1);
      if (isNamespace(prefix)) element.setAttributeNS(namespaces[prefix], key, value);
      else element.setAttribute(key, value);
    }
  }
  return element;
}
