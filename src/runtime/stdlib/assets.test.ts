// @vitest-environment jsdom
import {html} from "htl";
import {assert, test} from "vitest";
import {collectAssets} from "./assets.js";

function getAssets(root: HTMLElement): Set<string> {
  const assets = new Set<string>();
  collectAssets(assets, root);
  return assets;
}

test("find asset paths in descendants", () => {
  assert.deepStrictEqual(
    new Set([
      "./a-href.txt",
      "./audio-source-src.wav",
      "./audio-src.wav",
      "./img-src.png",
      "./img-srcset-src.png",
      "./img-srcset.png",
      "./link.css",
      "./picture-source-src.png",
      "./picture-srcset-src.png",
      "./picture-srcset.png",
      "./video-source-src.mp4",
      "./video-src.mp4"
    ]),
    getAssets(html`<div>
      <a href="./a-href.txt" download>download</a>
      <audio><source src="./audio-source-src.wav"></audio>
      <audio src="./audio-src.wav"></audio>
      <img src="./img-src.png">
      <img src="./img-srcset-src.png" srcset="./img-srcset.png 2x">
      <link href="./link.css" rel="stylesheet">
      <picture><source src="./picture-source-src.png"></picture>
      <picture><source src="./picture-srcset-src.png" srcset="./picture-srcset.png 2x"></picture>
      <video><source src="./video-source-src.mp4"></video>
      <video src="./video-src.mp4"></video>
    </div>`)
  );
});

test("decodes paths", () => {
  assert.deepStrictEqual(
    new Set(["./hello world.png"]),
    getAssets(html`<div><img src="./hello%20world.png"></div>`)
  );
});

test("strips query strings and anchor fragments from the path", () => {
  assert.deepStrictEqual(
    new Set(["./img1.png", "./img2.png", "./img3.png", "./img4.png"]),
    getAssets(html`<div>
      <img src="./img1.png?foo=bar">
      <img src="./img2.png#baz">
      <img src="./img3.png?foo#bar">
      <img src="./img4.png#foo?bar">
    </div>`)
  );
});

test("adds a leading dot slash to relative paths", () => {
  assert.deepStrictEqual(
    new Set([
      "./file.png",
      "./path/to/file.png",
      "/root.png",
      "./dot-slash.png",
      "../dot-dot-slash.png"
    ]),
    getAssets(html`<div>
      <img src="file.png">
      <img src="path/to/file.png">
      <img src="/root.png">
      <img src="./dot-slash.png">
      <img src="../dot-dot-slash.png">
    </div>`)
  );
});

test("ignores protocol links", () => {
  assert.deepStrictEqual(
    new Set([]),
    getAssets(html`<div>
      <img src="https://example.com/test.png">
    </div>`)
  );
});

test("ignores fragment links", () => {
  assert.deepStrictEqual(
    new Set([]),
    getAssets(html`<div>
      <a href="#test" download>download</a>
    </div>`)
  );
});

test("ignores rel=external elements", () => {
  assert.deepStrictEqual(
    new Set(["./internal.txt"]),
    getAssets(html`<div>
      <a href="external.txt" rel="external" download>download</a>
      <a href="internal.txt" rel="notexternal" download>download</a>
    </div>`)
  );
});
