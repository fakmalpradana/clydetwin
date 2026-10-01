# SPDX-License-Identifier: AGPL-3.0-or-later
"""DB fixtures: a throw-away `clydetwin_test` database on the TimescaleDB server (make live-up, or the CI service).

TEST_DATABASE_URL points at any database of that server (default: the local live DB on port 5434).
Tests that need the DB are skipped locally if it is down; in CI (env CI set) that is a failure.
"""

import os

import psycopg
import pytest
from psycopg.conninfo import make_conninfo

from db.migrate import migrate

SERVER = os.environ.get(
    "TEST_DATABASE_URL", "postgresql://clydetwin:clydetwin_local@localhost:5434/clydetwin"
)
TEST_DB = "clydetwin_test"


@pytest.fixture(scope="session")
def db_url():
    try:
        with psycopg.connect(SERVER, autocommit=True, connect_timeout=3) as c:
            c.execute(f"drop database if exists {TEST_DB} with (force)")
            c.execute(f"create database {TEST_DB}")
    except psycopg.OperationalError as e:
        if os.environ.get("CI"):
            raise
        pytest.skip(f"no TimescaleDB for tests ({e}); run `make live-up` or set TEST_DATABASE_URL")
    url = make_conninfo(SERVER, dbname=TEST_DB)
    migrate(url)
    return url


@pytest.fixture
def conn(db_url):
    """Fresh connection per test; the tables are emptied afterwards (schema stays)."""
    with psycopg.connect(db_url) as c:
        yield c
        c.rollback()
        c.execute("truncate ref.stations, ts.observations, meta.ingest_runs")
        c.commit()
