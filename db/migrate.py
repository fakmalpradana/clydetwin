# SPDX-License-Identifier: AGPL-3.0-or-later
"""Apply db/migrations/*.sql in name order. Usage: python -m db.migrate (env DATABASE_URL)."""

import os
from pathlib import Path

import psycopg

MIGRATIONS = Path(__file__).with_name("migrations")


def migrate(url: str | None = None) -> list[str]:
    applied = []
    with psycopg.connect(url or os.environ["DATABASE_URL"], autocommit=True) as conn:
        conn.execute("create schema if not exists meta")
        conn.execute(
            "create table if not exists meta.schema_migrations "
            "(name text primary key, applied_at timestamptz not null default now())"
        )
        done = {r[0] for r in conn.execute("select name from meta.schema_migrations")}
        for f in sorted(MIGRATIONS.glob("*.sql")):
            if f.name in done:
                continue
            with conn.transaction():  # a failing migration leaves nothing half applied
                conn.execute(f.read_text())
                conn.execute("insert into meta.schema_migrations (name) values (%s)", (f.name,))
            applied.append(f.name)
    return applied


if __name__ == "__main__":
    print("applied:", migrate() or "nothing to do")
