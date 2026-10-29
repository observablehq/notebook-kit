export const aapl = () => csv(dataset("aapl.csv"), true);
export const alphabet = () => csv(dataset("alphabet.csv"), true);
export const cars = () => csv(dataset("cars.csv"), true);
export const citywages = () => csv(dataset("citywages.csv"), true);
export const diamonds = () => csv(dataset("diamonds.csv"), true);
export const flare = () => csv(dataset("flare.csv"), true);
export const industries = () => csv(dataset("industries.csv"), true);
export const miserables = () => json(dataset("miserables.json"));
export const olympians = () => csv(dataset("olympians.csv"), true);
export const penguins = () => csv(dataset("penguins.csv"), true);
export const pizza = () => csv(dataset("pizza.csv"), true);
export const weather = () => csv(dataset("weather.csv"), true);

function dataset(name: string): string {
  return `https://esm.sh/@observablehq/sample-datasets/${name}`;
}

async function json(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`unable to fetch ${url}: status ${response.status}`);
  return response.json();
}

async function text(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`unable to fetch ${url}: status ${response.status}`);
  return response.text();
}

async function csv(url: string, typed: boolean) {
  const [contents, d3] = await Promise.all([text(url), import("https://esm.sh/d3-dsv")]); // prettier-ignore
  return d3.csvParse(contents, typed && d3.autoType);
}
