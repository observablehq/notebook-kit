import type {DatabaseClient, QueryResult, SqlDialect} from "./databaseClient.js";

export function sql(strings: Readonly<string[]>, ...params: unknown[]): SqlFragment {
  return new SqlFragment(strings, params);
}

sql.view = function view(
  strings: Readonly<string[]>,
  ...params: unknown[]
): SqlView {
  return new SqlView(strings, params);
};

sql.variant = function variant(
  variants: Partial<Record<SqlDialect | "default", unknown>>
): SqlVariant {
  return new SqlVariant(variants);
};

sql.ident = function ident(name: string): SqlVariant {
  return new SqlVariant({
    get databricks() {
      return sql([tquote(name)]);
    },
    get bigquery() {
      return sql([tquote(name)]);
    },
    get default() {
      return sql([dquote(name)]);
    }
  });
};

sql.text = function text(value: string): SqlFragment {
  return sql([squote(value)]);
};

export class SqlFragment {
  readonly strings: Readonly<string[]>;
  readonly params: unknown[];
  constructor(strings: Readonly<string[]>, params: unknown[]) {
    this.strings = strings;
    this.params = params;
  }
  flat(dialect?: SqlDialect): typeof this {
    const iquote = getIquote(dialect);
    const that = this.toDialect(dialect);
    const {strings, params} = that;
    const names = findUndernames(strings, params); // in-use table names, including ctes
    const map = new Map<SqlView, string>(); // from view to cte name
    const views: Record<string, SqlFragment> = {};
    let cteIndex = 0;

    // Bakes any SQL view or fragment params into the query, recursively.
    // Has the side-effect of populating the views map (of CTEs).
    function flatParams(
      istrings: Readonly<string[]>,
      iparams: unknown[]
    ): [Readonly<string[]>, unknown[]] {
      let ostrings: string[] | undefined;
      let oparams!: unknown[];
      for (let i = 0; i < iparams.length; ++i) {
        const param = iparams[i];
        const string = istrings[i + 1];
        if (param instanceof SqlView) {
          if (ostrings === undefined) {
            ostrings = istrings.slice(0, i + 1);
            oparams = iparams.slice(0, i);
          }
          let key = map.get(param);
          if (key == null) {
            do key = `_${++cteIndex}`;
            while (names.has(key));
            names.add(key);
            map.set(param, key);
            const [pstrings, pparams] = flatParams(param.strings, param.params);
            views[key] = new SqlFragment(pstrings, pparams);
          }
          ostrings[ostrings.length - 1] += iquote(key) + string;
        } else if (param instanceof SqlFragment) {
          if (ostrings === undefined) {
            ostrings = istrings.slice(0, i + 1);
            oparams = iparams.slice(0, i);
          }
          const [pstrings, pparams] = flatParams(param.strings, param.params);
          ostrings[ostrings.length - 1] += pstrings[0];
          ostrings.push(...pstrings.slice(1));
          ostrings[ostrings.length - 1] += string;
          oparams.push(...pparams);
        } else if (ostrings !== undefined) {
          oparams.push(param);
          ostrings.push(string);
        }
      }
      return ostrings === undefined
        ? [istrings, iparams]
        : [ostrings, oparams];
    }

    const [fstrings, fparams] = flatParams(strings, params);
    const [vstrings, vparams] = withViews(fstrings, fparams, views, iquote);
    return vstrings === strings && vparams === params
      ? that
      : reconstruct(that, vstrings, vparams);
  }
  query<T>(database: DatabaseClient): Promise<QueryResult<T>> {
    const {strings, params} = this.flat(database.dialect);
    return database.sql<T>(strings, ...params);
  }
  toDialect(dialect?: SqlDialect): typeof this {
    return fragmentToDialect(this, dialect, new Map());
  }
  toString() {
    return this.flat().strings.join("?");
  }
}

export class SqlView extends SqlFragment {
  constructor(strings: Readonly<string[]>, params: unknown[]) {
    super(strings, params);
  }
}

export class SqlVariant {
  readonly variants: Partial<Record<SqlDialect | "default", unknown>>;
  constructor(variants: Partial<Record<SqlDialect | "default", unknown>>) {
    this.variants = variants;
  }
  toDialect(dialect?: SqlDialect): unknown {
    return variantToDialect(this, dialect, new Map());
  }
  toString() {
    return String(this.toDialect());
  }
}

sql.Fragment = SqlFragment;
sql.View = SqlView;
sql.Variant = SqlVariant;

function fragmentToDialect<T extends SqlFragment>(
  fragment: T,
  dialect: SqlDialect | undefined,
  cache: Map<SqlFragment | SqlVariant, unknown>
): T {
  const {strings, params} = fragment;
  let ostrings: string[] | undefined;
  let oparams!: unknown[];
  for (let i = 0; i < params.length; ++i) {
    const param = params[i];
    const string = strings[i + 1];
    if (param instanceof SqlFragment) {
      let dparam: SqlFragment;
      if (cache.has(param)) dparam = cache.get(param) as SqlFragment;
      else cache.set(param, (dparam = fragmentToDialect(param, dialect, cache)));
      if (dparam !== param) {
        if (ostrings === undefined) {
          ostrings = strings.slice(0, i + 1);
          oparams = params.slice(0, i);
        }
        ostrings.push(string);
        oparams.push(dparam);
      } else if (ostrings !== undefined) {
        ostrings.push(string);
        oparams.push(param);
      }
    } else if (param instanceof SqlVariant) {
      let dparam: unknown;
      if (cache.has(param)) dparam = cache.get(param);
      else cache.set(param, (dparam = variantToDialect(param, dialect, cache)));
      if (ostrings === undefined) {
        ostrings = strings.slice(0, i + 1);
        oparams = params.slice(0, i);
      }
      ostrings.push(string);
      oparams.push(dparam);
    } else if (ostrings !== undefined) {
      ostrings.push(string);
      oparams.push(param);
    }
  }
  return ostrings === undefined
    ? fragment
    : reconstruct(fragment, ostrings, oparams);
}

function reconstruct<T extends SqlFragment>(
  fragment: T,
  strings: Readonly<string[]>,
  params: unknown[]
): T {
  return new (fragment.constructor as typeof SqlFragment)(strings, params) as T;
}

function variantToDialect(
  variant: SqlVariant,
  dialect: SqlDialect | undefined,
  cache: Map<SqlFragment | SqlVariant, unknown>
): unknown {
  let v: unknown;
  if (dialect !== undefined && dialect in variant.variants) v = variant.variants[dialect];
  else if ("default" in variant.variants) v = variant.variants.default;
  else throw new Error(dialect ? `missing variant: ${dialect}` : `missing dialect`);
  return v instanceof SqlFragment
    ? fragmentToDialect(v, dialect, cache)
    : v instanceof SqlVariant
      ? variantToDialect(v, dialect, cache)
      : v;
}

// Assumptions:
// - the views’ names are unique and non-conflicting
// - the views are defined in topological order
// - the views do not reference any other views
// - the views do not reference any other tables
function withViews(
  istrings: Readonly<string[]>,
  iparams: unknown[],
  views: Record<string, SqlView>,
  iquote: (name: string) => string
): [Readonly<string[]>, unknown[]] {
  const entries = Object.entries(views);
  if (!entries.length) return [istrings, iparams];
  const input = istrings[0];
  const withIndex = findWith(input);
  const ostrings: string[] = [];
  const oparams: unknown[] = [];
  let first = true;
  ostrings[0] = `${withIndex >= 0 ? input.slice(0, withIndex) : "WITH"}\n`;
  for (const [name, view] of entries) {
    if (view.params.some((p) => p instanceof SqlFragment))
      throw new Error("nested fragment");
    if (first) first = false;
    else ostrings[ostrings.length - 1] += ",\n";
    ostrings[ostrings.length - 1] += `${iquote(name)} AS (${view.strings[0]}`;
    ostrings.push(...view.strings.slice(1));
    ostrings[ostrings.length - 1] += ")";
    oparams.push(...view.params);
  }
  ostrings[ostrings.length - 1] +=
    withIndex >= 0 ? `,\n${input.slice(withIndex)}` : `\n${input}`;
  ostrings.push(...istrings.slice(1));
  oparams.push(...iparams);
  return [ostrings, oparams];
}

function findWith(input: string): number {
  const match = /^\s*(--.*\n|\/\*[\s\S]*?\*\/|\s)*with\b(\s+recursive\b)?/i.exec(input);
  return match ? match[0].length : -1;
}

function findUndernames(
  strings: Readonly<string[]>,
  params: unknown[],
  names = new Set<string>()
): Set<string> {
  const string = strings.join(" ");
  const pattern = /\b_\d+\b/g;
  for (
    let match: RegExpExecArray | null;
    (match = pattern.exec(string)) !== null;
  ) {
    names.add(match[0]);
  }
  for (const param of params) {
    if (param instanceof SqlFragment) {
      findUndernames(param.strings, param.params, names);
    }
  }
  return names;
}

/** Quotes the specified SQL identifier. */
function getIquote(dialect?: SqlDialect): (name: string) => string {
  switch (dialect) {
    case "databricks":
    case "bigquery":
      return tquote;
    default:
      return dquote;
  }
}

/** Quotes the specified name with double quotes. */
function dquote(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Quotes the specified name with backticks. */
function tquote(name: string): string {
  return `\`${name.replace(/`/g, "``")}\``;
}

/** Quotes the specified name with single quotes. */
function squote(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}
