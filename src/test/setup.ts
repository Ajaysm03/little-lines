import 'fake-indexeddb/auto'
import { beforeEach } from 'vitest'
import { db } from '../data/db'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})
