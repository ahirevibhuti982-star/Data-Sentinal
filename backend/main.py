"""
main.py
-------
FastAPI application entry point.

Design decisions:
- CORS is intentionally permissive (allow all origins) for local development.
  Tighten `allow_origins` before deploying to production.
- File uploads are handled with SpooledTemporaryFile – the uploaded bytes are
  read into memory as a string and parsed by Pandas. We never write the raw
  file to disk or execute it in any way.
- Row limit: We refuse files larger than 50 MB or with more than 500 000 rows
  to prevent denial-of-service via huge uploads.
- All responses are typed with Pydantic models for predictable serialization.
"""

import io
import math
from typing import Any

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import database
import engine as dq_engine

# ---------------------------------------------------------------------------
# App & middleware
# ---------------------------------------------------------------------------

app = FastAPI(title="DataSentinel API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_BYTES = 50 * 1024 * 1024   # 50 MB
MAX_ROWS = 500_000


@app.on_event("startup")
def startup():
    database.init_db()


# ---------------------------------------------------------------------------
# Pydantic response schemas
# ---------------------------------------------------------------------------


class FindingOut(BaseModel):
    id: int | None = None
    issue_type: str
    affected_column: str | None
    affected_count: int
    severity: str
    description: str
    sample_evidence: list[Any]


class ScanSummary(BaseModel):
    id: int
    filename: str
    row_count: int
    col_count: int
    quality_score: float
    total_issues: int
    created_at: str


class ScanDetail(ScanSummary):
    column_stats: dict
    findings: list[FindingOut]


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------


def _clean_value(v: Any) -> Any:
    """Convert numpy scalars and NaN to JSON-safe Python objects."""
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if hasattr(v, "item"):
        return v.item()
    return v


def _clean_dict(d: dict) -> dict:
    return {k: _clean_value(v) for k, v in d.items()}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/scans/upload", response_model=ScanDetail)
async def upload_scan(file: UploadFile = File(...)):
    # --- Validate file type ---
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted.")

    # --- Read bytes safely ---
    raw = await file.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {MAX_BYTES // (1024*1024)} MB limit.",
        )

    # --- Parse CSV ---
    try:
        # dtype=str: read every column as string first so we can validate
        # ourselves without Pandas silently coercing/truncating values.
        df = pd.read_csv(
            io.BytesIO(raw),
            dtype=str,
            keep_default_na=True,
            na_values=["", "NA", "N/A", "null", "NULL", "None", "NaN"],
            on_bad_lines="warn",
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to parse CSV: {exc}")

    if df.empty or len(df.columns) == 0:
        raise HTTPException(status_code=422, detail="The uploaded CSV is empty.")

    if len(df) > MAX_ROWS:
        raise HTTPException(
            status_code=413,
            detail=f"CSV exceeds the {MAX_ROWS:,} row limit.",
        )

    # --- Run analysis ---
    result = dq_engine.analyze(df)

    # --- Persist ---
    clean_stats = {
        col: _clean_dict(stats) for col, stats in result.column_stats.items()
    }
    scan_id = database.insert_scan(
        filename=file.filename,
        row_count=result.row_count,
        col_count=result.col_count,
        quality_score=result.quality_score,
        total_issues=result.total_issues,
        column_stats=clean_stats,
    )

    for f in result.findings:
        database.insert_finding(
            scan_id=scan_id,
            issue_type=f.issue_type,
            affected_column=f.affected_column,
            affected_count=f.affected_count,
            severity=f.severity,
            description=f.description,
            sample_evidence=f.sample_evidence,
        )

    # --- Build response ---
    scan_db = database.get_scan_by_id(scan_id)
    return _build_scan_detail(scan_db)


@app.get("/api/scans", response_model=list[ScanSummary])
def list_scans():
    rows = database.get_all_scans()
    return [
        ScanSummary(
            id=r["id"],
            filename=r["filename"],
            row_count=r["row_count"],
            col_count=r["col_count"],
            quality_score=r["quality_score"],
            total_issues=r["total_issues"],
            created_at=str(r["created_at"]),
        )
        for r in rows
    ]


@app.get("/api/scans/{scan_id}", response_model=ScanDetail)
def get_scan(scan_id: int):
    scan = database.get_scan_by_id(scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found.")
    return _build_scan_detail(scan)


def _build_scan_detail(scan: dict) -> ScanDetail:
    findings = [
        FindingOut(
            id=f["id"],
            issue_type=f["issue_type"],
            affected_column=f.get("affected_column"),
            affected_count=f["affected_count"],
            severity=f["severity"],
            description=f["description"],
            sample_evidence=f["sample_evidence"],
        )
        for f in scan.get("findings", [])
    ]
    return ScanDetail(
        id=scan["id"],
        filename=scan["filename"],
        row_count=scan["row_count"],
        col_count=scan["col_count"],
        quality_score=scan["quality_score"],
        total_issues=scan["total_issues"],
        created_at=str(scan["created_at"]),
        column_stats=scan["column_stats"],
        findings=findings,
    )
