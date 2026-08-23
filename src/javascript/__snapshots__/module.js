const _1 = () => {
const a = 1;
const b = 2;
return {a,b};
};

const _2 = (a,b) => {
const y = a + b;
return {y};
};

const _4 = (md,y) => {
return (
md`Hello, ${y}.`
)
};

const _3 = async (__variable) => {
const {BarChart} = await (import("https://api.observablehq.com/@d3/bar-chart.js?v=4").then((_) => {
  const module = __variable._module._runtime.module(_.default);
  const outputs = new Map(Array.from(__variable._outputs, (v) => [v._name, v]));
  outputs.get("BarChart")?.import("BarChart", module);
  return {};
}));

return {BarChart};
};

export default function define(runtime) {
  const main = runtime.module();
  main.define("cell 1", [], _1);
  main.define("a", ["cell 1"], (_) => _.a);
  main.define("b", ["cell 1"], (_) => _.b);
  main.define("cell 2", ["a","b"], _2);
  main.define("y", ["cell 2"], (_) => _.y);
  main.define("cell 4", ["md","y"], _4);
  main.define("cell 3", ["@variable"], _3);
  main.define("BarChart", ["cell 3"], (_) => _.BarChart);
  return main;
}
