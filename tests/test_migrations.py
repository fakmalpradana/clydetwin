# SPDX-License-Identifier: AGPL-3.0-or-later
from db.migrate import migrate


def test_schema_objects(conn):
    r = conn.execute(
        "select hypertable_schema, hypertable_name, compression_enabled "
        "from timescaledb_information.hypertables"
    ).fetchall()
    assert r == [("ts", "observations", True)]
    assert conn.execute("select count(*) from ref.stations").fetchone() == (0,)
    assert conn.execute("select count(*) from meta.ingest_runs").fetchone() == (0,)
    chunk = conn.execute(
        "select time_interval from timescaledb_information.dimensions "
        "where hypertable_name = 'observations'"
    ).fetchone()
    assert chunk[0].days == 30


def test_migrate_is_idempotent(db_url):
    assert migrate(db_url) == []
