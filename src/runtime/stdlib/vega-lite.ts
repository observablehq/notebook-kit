import * as vega from "npm:vega";
import * as vegaLite from "npm:vega-lite";
import * as vegaLiteApi from "npm:vega-lite-api";

export const vl = vegaLiteApi.register(vega, vegaLite);
