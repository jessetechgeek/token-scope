import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is required.')
  process.exit(1)
}

const sql = postgres(url, { max: 1, prepare: false })
const schema = readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf8')

sql.unsafe(schema)
  .then(() => console.log('Schema applied.'))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => sql.end())
