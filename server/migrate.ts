import { getMigrations } from 'better-auth/db/migration'
import { audit } from './audit.js'
import { getAuth } from './auth.js'
import { query } from './db.js'

/**
 * Creates or updates every table: Better Auth's (user, session, account,
 * verification) and the app's own (families, profiles, artwork, activity,
 * imported books, images). Safe to run again; it only adds what's missing.
 */
export const APP_SCHEMA = `
create table if not exists app_family (
  user_id text primary key references "user"(id) on delete cascade,
  parent_pin_hash text,
  role text not null default 'parent',
  created_at bigint not null
);

create table if not exists app_profile (
  id text primary key,
  user_id text not null references "user"(id) on delete cascade,
  name text not null,
  avatar text not null,
  color text not null,
  pin_hash text,
  created_at bigint not null,
  last_active_at bigint,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_at bigint not null
);
create index if not exists app_profile_sync on app_profile (user_id, server_at);

create table if not exists app_artwork (
  id text primary key,
  user_id text not null references "user"(id) on delete cascade,
  profile_id text not null,
  book_id text not null,
  page_id text not null,
  progress real not null default 0,
  completed_at bigint,
  finished_by_child boolean not null default false,
  has_layer boolean not null default false,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_at bigint not null
);
create index if not exists app_artwork_sync on app_artwork (user_id, server_at);

create table if not exists app_event (
  uid text primary key,
  user_id text not null references "user"(id) on delete cascade,
  profile_id text,
  type text not null,
  book_id text,
  page_id text,
  at bigint not null,
  data jsonb,
  server_at bigint not null
);
create index if not exists app_event_sync on app_event (user_id, server_at);
create index if not exists app_event_at on app_event (at);

create table if not exists app_book (
  id text primary key,
  user_id text not null references "user"(id) on delete cascade,
  meta jsonb not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_at bigint not null
);
create index if not exists app_book_sync on app_book (user_id, server_at);

create table if not exists app_blob (
  key text primary key,
  user_id text not null references "user"(id) on delete cascade,
  content_type text not null,
  data bytea not null,
  updated_at bigint not null
);

create table if not exists app_audit (
  id bigserial primary key,
  actor_id text,
  actor_label text not null,
  action text not null,
  target_type text,
  target_id text,
  summary text not null,
  before jsonb,
  after jsonb,
  context jsonb,
  at bigint not null
);
create index if not exists app_audit_action on app_audit (action, id);
`

export async function migrate(log: (msg: string) => void = () => {}): Promise<void> {
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(getAuth().options)
  if (toBeCreated.length || toBeAdded.length) {
    log(`Sign-in tables: creating ${toBeCreated.map((t) => t.table).join(', ') || 'none'}, updating ${toBeAdded.map((t) => t.table).join(', ') || 'none'}`)
    await runMigrations()
  } else log('Sign-in tables are up to date')
  await query(APP_SCHEMA)
  // Roles are now "owner" (set by npm run owner:create) and "parent". The old
  // rule made the first family an "admin"; those families become grown-ups.
  const demoted = await query<{ user_id: string }>(`update app_family set role = 'parent' where role = 'admin' returning user_id`)
  for (const r of demoted.rows)
    await audit({
      actorId: null,
      actorLabel: 'System',
      action: 'role.changed',
      targetType: 'user',
      targetId: r.user_id,
      summary: 'Admin role retired: this family is now a regular grown-up account',
      before: { role: 'admin' },
      after: { role: 'parent' },
    })
  if (demoted.rowCount) log(`Moved ${demoted.rowCount} old admin account(s) to grown-up`)
  log('App tables are up to date')
}
