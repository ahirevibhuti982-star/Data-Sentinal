"""
database.py
-----------
SQLite database setup using SQLAlchemy (Core, not ORM) for simplicity.
We store scan metadata and findings in two tables.

Design decision: We use SQLAlchemy Core (not ORM) to keep the dependency
footprint small and make it easy to inspect queries. SQLite is sufficient
for this tool since scans are infrequent and the dataset is never huge.
"""

import json
from pathlib import Path
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Float,
    Text,
    DateTime,
    MetaData,
    Table,
    inspect,
)
from sqlalchemy.sql import text
import datetime

DB_PATH = Path(__file__).parent / "datasentinel.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
metadata = MetaData()

# --- Table definitions ---------------------------------------------------

scans_table = Table(
    "scans",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("filename", String(256), nullable=False),
    Column("row_count", Integer, nullable=False),
    Column("col_count", Integer, nullable=False),
    Column("quality_score", Float, nullable=False),
    Column("total_issues", Integer, nullable=False),
    Column("column_stats", Text, nullable=False),   # JSON blob
    Column("created_at", DateTime, default=datetime.datetime.utcnow),
)

findings_table = Table(
    "findings",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("scan_id", Integer, nullable=False),
    Column("issue_type", String(64), nullable=False),
    Column("affected_column", String(256), nullable=True),
    Column("affected_count", Integer, nullable=False),
    Column("severity", String(16), nullable=False),
    Column("description", Text, nullable=False),
    Column("sample_evidence", Text, nullable=False),  # JSON blob
)


def init_db() -> None:
    """Create tables if they don't exist yet."""
    metadata.create_all(engine)


def insert_scan(
    filename: str,
    row_count: int,
    col_count: int,
    quality_score: float,
    total_issues: int,
    column_stats: dict,
) -> int:
    """Persist a new scan record and return its auto-generated ID."""
    with engine.begin() as conn:
        result = conn.execute(
            scans_table.insert().values(
                filename=filename,
                row_count=row_count,
                col_count=col_count,
                quality_score=round(quality_score, 1),
                total_issues=total_issues,
                column_stats=json.dumps(column_stats),
                created_at=datetime.datetime.utcnow(),
            )
        )
        return result.inserted_primary_key[0]


def insert_finding(
    scan_id: int,
    issue_type: str,
    affected_column: str | None,
    affected_count: int,
    severity: str,
    description: str,
    sample_evidence: list,
) -> None:
    """Persist a single finding record."""
    with engine.begin() as conn:
        conn.execute(
            findings_table.insert().values(
                scan_id=scan_id,
                issue_type=issue_type,
                affected_column=affected_column,
                affected_count=affected_count,
                severity=severity,
                description=description,
                sample_evidence=json.dumps(sample_evidence),
            )
        )


def get_all_scans() -> list[dict]:
    """Return summary rows for the scan history list."""
    with engine.connect() as conn:
        rows = conn.execute(
            scans_table.select().order_by(scans_table.c.created_at.desc())
        ).fetchall()
        return [dict(r._mapping) for r in rows]


def get_scan_by_id(scan_id: int) -> dict | None:
    """Return a single scan with its findings."""
    with engine.connect() as conn:
        row = conn.execute(
            scans_table.select().where(scans_table.c.id == scan_id)
        ).fetchone()
        if row is None:
            return None
        scan = dict(row._mapping)
        scan["column_stats"] = json.loads(scan["column_stats"])

        finding_rows = conn.execute(
            findings_table.select().where(
                findings_table.c.scan_id == scan_id
            )
        ).fetchall()
        findings = []
        for fr in finding_rows:
            f = dict(fr._mapping)
            f["sample_evidence"] = json.loads(f["sample_evidence"])
            findings.append(f)

        scan["findings"] = findings
        return scan
