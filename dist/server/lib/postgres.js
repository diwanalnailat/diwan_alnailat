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
      /json_extract\(meta,'\$\.committee_id'\)/g,
      "(meta::jsonb ->> 'committee_id')",
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
        for (const statement of list) {
          const entry = statements.get(statement);
          if (!entry)
            throw new Error("Statement belongs to a different database");
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
    max: 1,
    connect_timeout: 10,
    idle_timeout: 20,
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
  return databaseAdapter({
    query: query(sql),
    transaction: (callback) =>
      sql.begin((transaction) => callback(query(transaction))),
    close: () => sql.end({ timeout: 5 }),
  });
}
