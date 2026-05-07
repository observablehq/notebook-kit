import {DatabaseClient} from "./databaseClient.js";
import * as DOM from "./dom/index.js";
import {FileAttachment} from "./fileAttachment.js";
import * as Generators from "./generators/index.js";
import {Interpreter} from "./interpreter.js";
import {Mutable} from "./mutable.js";
import {Observer} from "./observer.js";
import * as recommendedLibraries from "./recommendedLibraries.js";
import {require} from "./require.js";
import * as sampleDatasets from "./sampleDatasets.js";

export const root = document.querySelector("main") ?? document.body;

export const library = {
  now: () => Generators.now(),
  width: () => Generators.width(root),
  DatabaseClient: () => DatabaseClient,
  FileAttachment: () => FileAttachment,
  Generators: () => Generators,
  Interpreter: () => Interpreter,
  Mutable: () => Mutable,
  DOM: () => DOM, // deprecated!
  require: () => require, // deprecated!
  __ojs_observer: () => () => new Observer(),
  ...recommendedLibraries,
  ...sampleDatasets
};
