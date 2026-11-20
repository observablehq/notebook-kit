# Observable Notebook Kit

**Observable Notebook Kit** is an open-source command-line tool for building static sites from Observable Notebooks based on an open file format. Notebook Kit also includes a Vite plugin and a low-level JavaScript interface for deep integration of Observable Notebooks with custom web applications.

Notebook Kit is available as part of [Notebooks 2.0 Technology Preview](https://observablehq.com/notebook-kit/), which includes [Observable Desktop](https://observablehq.com/notebook-kit/desktop), a notebook editor for macOS.

## Installing

```sh
npm add @observablehq/notebook-kit
```

Notebook Kit requires Node.js 20.19+ or 22.12+ (or 24+ for SQLite).

## Notebooks

A notebook is an HTML file: a `<notebook>` element, an optional `<title>`, and one `<script>` per cell.

```html
<!doctype html>
<notebook theme="air">
  <title>Hello, world!</title>
  <script type="text/markdown">
    # Hello, world!
  </script>
  <script type="module" pinned>
    const x = view(Inputs.range([0, 100], {label: "x", step: 1}));
  </script>
  <script type="text/markdown">
    The square of ${x} is ${x ** 2}.
  </script>
</notebook>
```

Notebooks are reactive. Top-level variables declared in one cell can be referenced by any other; when a variable changes, the cells that reference it run again. Order doesn’t matter.

A JavaScript cell is either an *expression*, such as `1 + 2`, whose value is displayed, or a *program* of statements and declarations, which displays nothing unless you call `display(value)`. Promises are implicitly awaited across cells; generators yield their latest value. `view(input)` displays an input and returns a generator of its value.

The `type` attribute sets the cell’s language:

- `module` - JavaScript
- `text/x-typescript` - TypeScript
- `text/markdown` - Markdown, with `${…}` interpolation
- `text/html` - HTML, with `${…}` interpolation (escaped)
- `application/sql` - SQL; see [databases](#databases)
- `application/x-tex` - TeX
- `text/vnd.graphviz` - DOT (Graphviz)
- `application/vnd.observable.javascript` - Observable JavaScript (notebooks 1.0)
- `application/vnd.node.javascript` - Node.js [data loader](#data)
- `text/x-python` - Python data loader
- `text/x-r` - R data loader

Other `<script>` attributes are `pinned` to show source, `hidden` to suppress display, `output` to name the value of a non-JavaScript cell, `database` for SQL, `format` for data loaders, and `id`, a positive integer, for stable identity when editing. The `<notebook>` element takes a `theme`, such as `air`, `midnight`, or `light-dark(cotton, slate)`, and `readonly`.

Cell source is indented four spaces, which are trimmed. Escape a `</script>` inside a cell as `<\/script>`.

The standard library includes `display`, `view`, `width`, `now`, `invalidation`, `visibility`, and `FileAttachment`, along with [Observable Inputs](https://github.com/observablehq/inputs) (`Inputs`), [Observable Plot](https://observablehq.com/plot/) (`Plot`), [D3](https://d3js.org) (`d3`), [Hypertext Literal](https://github.com/observablehq/htl) (`html`, `svg`), `md`, and `tex`. Import anything else from npm:

```js
import * as he from "npm:he";
```

## Data

`FileAttachment` loads a file from the notebook’s directory or a subdirectory:

```js
const stocks = FileAttachment("data/stocks.csv").csv({typed: true});
```

*Data loaders* are Node.js, Python, or R cells that run at build time rather than in the browser. A loader writes to stdout; `format` says how to parse it (`text`, `json`, `csv`, `tsv`, `xml`, `arrow`, `parquet`, `blob`, `buffer`, `html`, or an image type) and `output` names the result.

```html
<script type="text/x-python" format="json" output="hello">
  import json, sys

  json.dump({"hello": "world"}, sys.stdout)
</script>
```

Results are cached in `.observable/cache` alongside the notebook. Delete a file there to run the loader again.

## Databases

SQL cells query a database and cache the results in `.observable/cache`, too. The default database is an in-memory DuckDB.

```html
<script type="application/sql" database="duckdb" output="answer">
  SELECT 1 + 2 AS answer
</script>
```

DuckDB, SQLite, and localhost Postgres need no configuration. Otherwise, name your databases in `.observable/databases.json` next to the notebook:

```json
{
  "warehouse": {
    "type": "snowflake",
    "account": "tk421.us-east-1.aws",
    "username": "demo",
    "password": "opensesame"
  }
}
```

Install the driver for each database you use: `@duckdb/node-api`, `postgres`, `snowflake-sdk`, `@google-cloud/bigquery`, or `@databricks/sql`.

## Command-line interface

```sh
notebooks preview --root docs
notebooks build --root docs -- docs/*.html
notebooks download https://observablehq.com/@d3/bar-chart > docs/bar-chart.html
notebooks query --database duckdb 'SELECT 1 + ' '2'
```

`preview` starts a live-reloading server. `build` writes a static site to `.observable/dist` within the root; note the `--` before the list of notebooks. `download` converts a notebook from observablehq.com to HTML. `query` runs and caches a database query. Pass `--template` to `preview` or `build` to wrap notebooks in a custom page template. Run `notebooks help` or `notebooks <command> --help` for all options.

## JavaScript interface

The Vite plugin renders notebooks as HTML pages in your own Vite app:

```js
import {defineConfig} from "vite";
import {config, observable} from "@observablehq/notebook-kit/vite";

export default defineConfig({...config(), plugins: [observable()]});
```

Lower-level APIs parse, transpile, serialize, and run notebooks: see `@observablehq/notebook-kit`, `@observablehq/notebook-kit/runtime`, and `@observablehq/notebook-kit/databases`. Each ships with TypeScript declarations.

## Further reading

The documentation is itself written as notebooks; read them on [observablehq.com](https://observablehq.com/notebook-kit/) or as source in [`docs/`](https://github.com/observablehq/notebook-kit/tree/main/docs):

- [System guide](https://github.com/observablehq/notebook-kit/blob/main/docs/system-guide.html) - cells, reactivity, and the standard library
- [Notebook Kit](https://github.com/observablehq/notebook-kit/blob/main/docs/kit.html) - the file format, templates, CLI, and API
- [Data loaders](https://github.com/observablehq/notebook-kit/blob/main/docs/data-loaders.html)
- [Database connectors](https://github.com/observablehq/notebook-kit/blob/main/docs/databases.html) - configuration for each database
