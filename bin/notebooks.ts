#!/usr/bin/env node

const [, , command] = process.argv;

switch (command) {
  case "build": {
    const {default: run} = await import("./build.js");
    await run(process.argv.slice(3));
    break;
  }
  case "download": {
    const {default: run} = await import("./download.js");
    await run(process.argv.slice(3));
    break;
  }
  case "preview": {
    const {default: run} = await import("./preview.js");
    await run(process.argv.slice(3));
    break;
  }
  default: {
    console.log(
      `usage: notebooks <command>

  preview      start the preview server
  build        generate a static site
  download     download an Observable Notebook as HTML
  help         print usage information
  version      print the version
`
    );
    if (command !== "help") process.exit(1);
    break;
  }
}
