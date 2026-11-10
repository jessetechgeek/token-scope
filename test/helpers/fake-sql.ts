import type { Sql } from 'postgres'

export type FakeSql = Sql & { batches: Record<string, unknown>[][] }

export function fakeSql(options: { failWith?: Error } = {}): FakeSql {
  const batches: Record<string, unknown>[][] = []
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    if (options.failWith) throw options.failWith
    const first = values[0]
    if (typeof first === 'string' && first.startsWith('[')) {
      const rows = JSON.parse(first) as Record<string, unknown>[]
      batches.push(rows)
      return [{ inserted: rows.length }]
    }
    return [{ '?column?': 1 }]
  }
  return Object.assign(sql, { batches, end: async () => {} }) as unknown as FakeSql
}
