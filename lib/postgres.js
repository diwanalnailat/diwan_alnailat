// Server-only adapter for the existing Worker database contract.
// SQL originates in trusted application code; values always remain parameters.
export function postgresStatement(source, previousChanges) {
  let index = 0;
  let sql = source.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g, (token) =>
    token === "?" ? `$${++index}` : token,
  );
  if (/changes\(\)/i.test(sql)) {
    if (!Number.isInteger(previousChanges))
      throw new Error("A change guard requires an atomic batch");
    sql = sql.replace(/changes\(\)/gi, String(previousChanges));
  }
  if (/^INSERT OR IGNORE /i.test(sql)) {
    sql =
      sql.replace(/^INSERT OR IGNORE /i, "INSERT ") + " ON CONFLICT DO NOTHING";
  }
  return sql
    .replace(/json_each\((\$\d+)\)/g, "jsonb_array_elements_text($1::jsonb)")
    .replace(
      /json_extract\(meta,'\$\.(committee_id|claimant_id|task_id|reviewer_id)'\)/g,
      "(meta::jsonb ->> '$1')",
    )
    .replace(
      /lower\(hex\(randomblob\(16\)\)\)/g,
      "replace(gen_random_uuid()::text,'-','')",
    )
    .replace(
      /printf\('%08d',number\)/g,
      "lpad(number::text,GREATEST(8,length(number::text)),'0')",
    );
}

function storageError(error) {
  const label = {
    23505: "UNIQUE constraint",
    23503: "FOREIGN KEY constraint",
    23502: "NOT NULL constraint",
    23514: "CHECK constraint",
    "42P01": "no such table",
  }[error.code];
  if (!label) return error;
  return Object.assign(
    new Error(`${label}: ${error.constraint_name || error.constraint || ""}`),
    {
      code: error.code,
    },
  );
}

export function databaseAdapter(driver) {
  const statements = new WeakMap();
  let closing;
  async function execute(query, source, args, previousChanges) {
    try {
      return await query(postgresStatement(source, previousChanges), args);
    } catch (error) {
      throw storageError(error);
    }
  }
  function prepare(source, args = []) {
    const statement = {
      bind: (...values) => prepare(source, values),
      all: async () => ({
        results: (await execute(driver.query, source, args)).rows,
      }),
      first: async () =>
        (await execute(driver.query, source, args)).rows[0] ?? null,
      run: async () => ({
        meta: { changes: (await execute(driver.query, source, args)).count },
      }),
    };
    statements.set(statement, { source, args });
    return statement;
  }
  return {
    dialect: "postgres",
    prepare,
    async batch(list) {
      return driver.transaction(async (query) => {
        // Preserve SQLite/D1's serialized writer semantics for balance/stock checks.
        // Transaction-scoped: safe across processes and Supabase transaction pooling.
        await query("SELECT pg_advisory_xact_lock(1748320617)", []);
        const results = [];
        let previousChanges = 0;
        for (let i = 0; i < list.length; i++) {
          const statement = list[i];
          const entry = statements.get(statement);
          if (!entry)
            throw new Error("Statement belongs to a different database");
          const next = statements.get(list[i + 1]);
          // The guard depends on this write's affected row count. Evaluate both
          // in Postgres instead of returning to the server between them.
          if (
            next &&
            /^INSERT INTO nl_guards(?:\s*\(id,value\))?\s+VALUES\(\?,changes\(\)\)$/i.test(
              next.source,
            ) &&
            next.args.length === 1 &&
            /^(UPDATE |INSERT INTO |DELETE FROM )/i.test(entry.source) &&
            !/\bRETURNING\b|;|changes\(\)/i.test(entry.source)
          ) {
            try {
              const sql = postgresStatement(entry.source);
              const result = await query(
                `WITH changed AS (${sql} RETURNING 1) INSERT INTO nl_guards(id,value) SELECT $${entry.args.length + 1},count(*) FROM changed RETURNING value`,
                [...entry.args, ...next.args],
              );
              results.push(
                {
                  results: [],
                  meta: { changes: Number(result.rows[0].value) },
                },
                { results: [], meta: { changes: result.count } },
              );
              previousChanges = result.count;
              i++;
              continue;
            } catch (error) {
              throw storageError(error);
            }
          }
          const result = await execute(
            query,
            entry.source,
            entry.args,
            previousChanges,
          );
          previousChanges = result.count;
          results.push({
            results: result.rows,
            meta: { changes: result.count },
          });
        }
        return results;
      });
    },
    close: () => (closing ||= driver.close()),
  };
}

export async function postgresDatabase(connectionString) {
  if (!connectionString || connectionString.includes("[YOUR-PASSWORD]"))
    throw new Error("DATABASE_URL is incomplete");
  const { default: postgres } = await import("postgres");
  const sql = postgres(connectionString, {
    ssl: "require",
    prepare: false,
    max: 4,
    // Application columns use built-in scalar types, not custom array types.
    fetch_types: false,
    // Allow cold pooler connections time to complete, especially on local networks.
    connect_timeout: 30,
    // Keep local connections through time spent filling forms and reading OTPs.
    idle_timeout:
      process.env.NODE_ENV === "development" || process.env.DIWAN_LOCAL_PORT
        ? 600
        : 60,
    connection: { application_name: "diwan", statement_timeout: 30000 },
    types: {
      integerTotals: {
        to: 20,
        from: [20, 1700],
        serialize: (value) => String(value),
        parse: (value) => {
          const number = Number(value);
          if (!Number.isSafeInteger(number))
            throw new Error("Database integer exceeds safe range");
          return number;
        },
      },
    },
  });
  const query = (client) => async (text, args) => {
    const rows = await client.unsafe(text, args);
    return { rows: Array.from(rows), count: rows.count };
  };
  // Bound concurrent screen reads to the pool size instead of filling the
  // driver's pipeline with a burst of unrelated statements.
  // Hold a slot for the entire transaction, never between its statements.
  let active = 0;
  const waiting = [];
  async function withConnection(run) {
    if (active >= 4) await new Promise((resolve) => waiting.push(resolve));
    else active++;
    try {
      return await run();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  }
  return databaseAdapter({
    query: (text, args) => withConnection(() => query(sql)(text, args)),
    transaction: (callback) =>
      withConnection(() =>
        sql.begin((transaction) => callback(query(transaction))),
      ),
    close: () => sql.end({ timeout: 5 }),
  });
}
