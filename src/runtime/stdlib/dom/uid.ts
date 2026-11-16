let count = 0;

/** @deprecated */
export function uid(name?: string): Id {
  return new Id(`O-${name == null ? "" : `${name}-`}${++count}`);
}

class Id {
  id: string;
  href: string;
  constructor(id: string) {
    this.id = id;
    this.href = new URL(`#${id}`, location.href).href;
  }
  toString() {
    return `url(${this.href})`;
  }
}
