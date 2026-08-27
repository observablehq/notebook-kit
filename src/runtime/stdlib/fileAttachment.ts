import {inferTypes} from "./dsv.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
const files = new Map<string, FileAttachmentImpl>();

export type DsvOptions = {delimiter?: string; array?: boolean; typed?: "auto" | boolean};
export type DsvResult = (Record<string, any>[] | any[][]) & {columns: string[]};

export interface FileAttachment {
  /** The URL of the file. */
  href: string;
  /** The name of the file (not including the path), such as "test.csv". */
  name: string;
  /** The MIME type, such as "text/csv". */
  mimeType: string;
  /** The time this file was most-recently modified, as milliseconds since epoch, if known. */
  lastModified?: number;
  /** The size of this file in bytes, if known. */
  size?: number;
  /** @deprecated use FileAttachment.href instead */
  url(): Promise<string>;
  /** Returns the contents of this file as a Blob. */
  blob(): Promise<Blob>;
  /** Returns the contents of this file as an ArrayBuffer. */
  arrayBuffer(): Promise<ArrayBuffer>;
  /** Returns the contents of this file as a string with the given encoding. */
  text(encoding?: string): Promise<string>;
  /** Returns the contents of this file as JSON. */
  json(): Promise<any>;
  /** Returns a byte stream to the contents of this file. */
  stream(): Promise<ReadableStream<Uint8Array<ArrayBufferLike>>>;
  /** Returns the contents of this file as delimiter-separated values. */
  dsv(options?: DsvOptions): Promise<DsvResult>;
  /** Returns the contents of this file as comma-separated values. */
  csv(options?: Omit<DsvOptions, "delimiter">): Promise<DsvResult>;
  /** Returns the contents of this file as tab-separated values. */
  tsv(options?: Omit<DsvOptions, "delimiter">): Promise<DsvResult>;
  /** Returns the contents of this file as an image. */
  image(props?: Partial<HTMLImageElement>): Promise<HTMLImageElement>;
  /** Returns the contents of this Arrow IPC file as an Apache Arrow table. */
  arrow(): Promise<any>;
  /** Returns the contents of this file as an Arquero table. */
  arquero(options?: any): Promise<any>;
  /** Returns the contents of this Parquet file as an Apache Arrow table. */
  parquet(): Promise<any>;
  /** Returns the contents of this file as an XML document. */
  xml(mimeType?: DOMParserSupportedType): Promise<Document>;
  /** Returns the contents of this file as an HTML document. */
  html(): Promise<Document>;
}

let strict = false;

export const FileAttachment = (name: string, base = document.baseURI): FileAttachment => {
  const href = new URL(name, base).href;
  let file = files.get(href);
  if (!file) {
    if (strict) {
      throw new Error(`File not found: ${name}`);
    } else {
      file = new FileAttachmentImpl(href, name.split("/").pop()!);
      files.set(href, file);
    }
  }
  return file;
};

export interface FileInfo {
  path: string;
  mimeType?: string;
  lastModified?: number;
  size?: number;
}

export function requireFileRegistration(value: boolean) {
  strict = value;
}

export function registerFile(
  name: string,
  info: FileInfo | null,
  base: string | URL = document.baseURI
) {
  const href = new URL(name, base).href;
  if (info == null) {
    files.delete(href);
  } else {
    const {path, mimeType, lastModified, size} = info;
    const file = new FileAttachmentImpl(
      new URL(path, base).href,
      name.split("/").pop()!,
      mimeType,
      lastModified,
      size
    );
    files.set(href, file);
    return file;
  }
}

async function fetchFile(file: FileAttachment): Promise<Response> {
  const response = await fetch(file.href);
  if (!response.ok) throw new Error(`Unable to load file: ${file.name}`);
  return response;
}

export abstract class AbstractFile implements FileAttachment {
  name!: string;
  mimeType!: string;
  lastModified!: number | undefined;
  size!: number | undefined;
  abstract href: string;
  constructor(name: string, mimeType = guessMimeType(name), lastModified?: number, size?: number) {
    Object.defineProperties(this, {
      name: {value: `${name}`, enumerable: true},
      mimeType: {value: `${mimeType}`, enumerable: true},
      lastModified: {value: lastModified === undefined ? undefined : +lastModified, enumerable: true}, // prettier-ignore
      size: {value: size === undefined ? undefined : +size, enumerable: true}
    });
  }
  async url(): Promise<string> {
    return this.href;
  }
  async blob(): Promise<Blob> {
    return (await fetchFile(this)).blob();
  }
  async arrayBuffer(): Promise<ArrayBuffer> {
    return (await fetchFile(this)).arrayBuffer();
  }
  async text(encoding?: string): Promise<string> {
    return encoding === undefined
      ? (await fetchFile(this)).text()
      : new TextDecoder(encoding).decode(await this.arrayBuffer());
  }
  async json(): Promise<any> {
    return (await fetchFile(this)).json();
  }
  async stream(): Promise<ReadableStream<Uint8Array<ArrayBufferLike>>> {
    return (await fetchFile(this)).body!;
  }
  async dsv({delimiter = ",", array = false, typed = false}: DsvOptions = {}): Promise<DsvResult> {
    const [text, d3] = await Promise.all([this.text(), import("https://cdn.jsdelivr.net/npm/d3-dsv/+esm")]); // prettier-ignore
    const format = d3.dsvFormat(delimiter);
    const parse = array ? ((typed &&= true), format.parseRows) : format.parse;
    const output = parse(text, typed === true ? d3.autoType : undefined);
    if (typed === "auto") inferTypes(output, output.columns);
    return output;
  }
  async csv(options?: Omit<DsvOptions, "delimiter">): Promise<DsvResult> {
    return this.dsv({...options, delimiter: ","});
  }
  async tsv(options?: Omit<DsvOptions, "delimiter">): Promise<DsvResult> {
    return this.dsv({...options, delimiter: "\t"});
  }
  async image(props?: Partial<HTMLImageElement>): Promise<HTMLImageElement> {
    const url = await this.url();
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      if (new URL(url, document.baseURI).origin !== location.origin) i.crossOrigin = "anonymous";
      Object.assign(i, props);
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(`Unable to load file: ${this.name}`));
      i.src = url;
    });
  }
  async arrow(): Promise<any> {
    const [Arrow, response] = await Promise.all([import("https://cdn.jsdelivr.net/npm/apache-arrow@17.0.0/+esm"), fetchFile(this)]); // prettier-ignore
    return Arrow.tableFromIPC(response);
  }
  async arquero(options?: any): Promise<any> {
    let request: Promise<unknown>;
    let from: string;
    switch (this.mimeType) {
      case "application/json":
        request = this.text();
        from = "fromJSON";
        break;
      // @ts-expect-error fall through
      case "text/tab-separated-values":
        if (options?.delimiter === undefined) options = {...options, delimiter: "\t"};
      // fall through
      case "text/csv":
        request = this.text();
        from = "fromCSV";
        break;
      default:
        if (/\.arrow$/i.test(this.name)) {
          request = this.arrow();
          from = "fromArrow";
        } else if (/\.parquet$/i.test(this.name)) {
          request = this.parquet();
          from = "fromArrow";
        } else {
          throw new Error(`unable to determine Arquero loader: ${this.name}`);
        }
        break;
    }
    const [aq, body] = await Promise.all([import("https://cdn.jsdelivr.net/npm/arquero/+esm"), request]); // prettier-ignore
    return aq[from](body, options);
  }
  async parquet() {
    const [Arrow, Parquet, buffer] = await Promise.all([import("https://cdn.jsdelivr.net/npm/apache-arrow@17.0.0/+esm"), import("https://cdn.jsdelivr.net/npm/parquet-wasm/+esm").then(async (Parquet) => (await Parquet.default("https://cdn.jsdelivr.net/npm/parquet-wasm/esm/parquet_wasm_bg.wasm"), Parquet)), this.arrayBuffer()]); // prettier-ignore
    return Arrow.tableFromIPC(Parquet.readParquet(new Uint8Array(buffer)).intoIPCStream());
  }
  async zip() {
    const [{ZipArchive}, buffer] = await Promise.all([import("./zip.js"), this.arrayBuffer()]);
    return ZipArchive.from(buffer);
  }
  async xml(mimeType: DOMParserSupportedType = "application/xml"): Promise<Document> {
    return new DOMParser().parseFromString(await this.text(), mimeType);
  }
  async html(): Promise<Document> {
    return this.xml("text/html");
  }
  async xlsx() {
    const [{Workbook}, buffer] = await Promise.all([import("./xlsx.js"), this.arrayBuffer()]);
    return Workbook.load(buffer);
  }
}

// TODO Replace this with static analysis of files.
function guessMimeType(name: string): string {
  const i = name.lastIndexOf(".");
  const j = name.lastIndexOf("/");
  const extension = i > 0 && (j < 0 || i > j) ? name.slice(i).toLowerCase() : "";
  switch (extension) {
    case ".csv":
      return "text/csv";
    case ".tsv":
      return "text/tab-separated-values";
    case ".json":
      return "application/json";
    case ".html":
      return "text/html";
    case ".xml":
      return "application/xml";
    case ".png":
      return "image/png";
    case ".jpg":
      return "image/jpg";
    case ".js":
      return "text/javascript";
    default:
      return "application/octet-stream";
  }
}

class FileAttachmentImpl extends AbstractFile {
  href!: string;
  constructor(href: string, name: string, mimeType?: string, lastModified?: number, size?: number) {
    super(name, mimeType, lastModified, size);
    Object.defineProperty(this, "href", {value: href});
  }
}

Object.defineProperty(FileAttachmentImpl, "name", {value: "FileAttachment"}); // prevent mangling
FileAttachment.prototype = FileAttachmentImpl.prototype; // instanceof

type FileResolution = {url: string; mimeType?: string; lastModified?: number; size?: number};
type FileResolver = (name: string) => FileResolution | string | null;

export function fileAttachments(resolve: FileResolver): (name: string) => FileAttachment {
  function FileAttachment(name: string) {
    const result = resolve((name += ""));
    if (result == null) throw new Error(`File not found: ${name}`);
    if (typeof result === "object" && "url" in result) {
      const {url, mimeType, lastModified, size} = result;
      return new FileAttachmentImpl(url, name, mimeType, lastModified, size);
    }
    return new FileAttachmentImpl(result, name);
  }
  FileAttachment.prototype = FileAttachmentImpl.prototype; // instanceof
  return FileAttachment;
}
