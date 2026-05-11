import JSZip from "https://cdn.jsdelivr.net/npm/jszip/+esm";
import {AbstractFile} from "./fileAttachment.js";

export class ZipArchive {
  declare private readonly _: JSZip;
  declare readonly filenames: string[];
  constructor(archive: JSZip) {
    Object.defineProperties(this, {
      _: {value: archive},
      filenames: {value: Object.keys(archive.files).filter((name) => !archive.files[name].dir)}
    });
  }
  static async from(buffer: ArrayBuffer) {
    return new ZipArchive(await JSZip.loadAsync(buffer));
  }
  file(path: string): ZipArchiveEntry {
    const object = this._.file((path = `${path}`));
    if (!object || object.dir) throw new Error(`file not found: ${path}`);
    return new ZipArchiveEntry(object);
  }
}

class ZipArchiveEntry extends AbstractFile {
  href!: string; // async
  declare private readonly _: JSZip.JSZipObject;
  declare private _url: Promise<string>;
  constructor(object: JSZip.JSZipObject) {
    super(undefined!, object.name);
    Object.defineProperties(this, {
      _: {value: object},
      _url: {writable: true}
    });
  }
  async url() {
    return this._url || (this._url = this.blob().then(URL.createObjectURL));
  }
  async blob() {
    return this._.async("blob");
  }
  async arrayBuffer() {
    return this._.async("arraybuffer");
  }
  async text() {
    return this._.async("text");
  }
  async json() {
    return JSON.parse(await this.text());
  }
}
