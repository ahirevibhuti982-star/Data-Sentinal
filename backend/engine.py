"""
engine.py
---------
The core data-quality analysis engine.

Design decisions:
- All analysis is purely deterministic – no randomness, no AI calls.
- Outlier detection uses the IQR (interquartile range) method, which is
  robust against skewed distributions and requires no distributional assumptions.
- Domain-specific validation rules (negative prices, future dates, etc.) are
  applied only where the column name and dtype match heuristics so that the
  engine works reasonably on any CSV without configuration.
- We never execute or eval() cell contents; every cell is treated as a plain string.
- Severity thresholds: critical >20%, high 5-20%, medium 1-5%, low <1% of rows.
"""

from __future__ import annotations

import re
import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class Finding:
    issue_type: str          # missing_values | duplicates | invalid_values | outliers
    affected_column: str | None
    affected_count: int
    severity: str            # critical | high | medium | low
    description: str
    sample_evidence: list[Any]  # up to 5 example values / row indices


@dataclass
class ScanResult:
    row_count: int
    col_count: int
    quality_score: float          # 0–100
    total_issues: int
    findings: list[Finding] = field(default_factory=list)
    column_stats: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _severity(affected: int, total: int) -> str:
    if total == 0:
        return "low"
    ratio = affected / total
    if ratio > 0.20:
        return "critical"
    if ratio > 0.05:
        return "high"
    if ratio > 0.01:
        return "medium"
    return "low"


def _sample(series: pd.Series, n: int = 5) -> list:
    """Return up to n sample values as plain Python objects."""
    values = series.dropna().head(n).tolist()
    result = []
    for v in values:
        if isinstance(v, float) and math.isnan(v):
            result.append(None)
        elif hasattr(v, "item"):          # numpy scalar → python scalar
            result.append(v.item())
        else:
            result.append(v)
    return result


def _col_stats(series: pd.Series) -> dict:
    """Compute per-column statistics returned to the frontend."""
    stats: dict[str, Any] = {
        "dtype": str(series.dtype),
        "missing_count": int(series.isna().sum()),
        "missing_pct": round(series.isna().mean() * 100, 2),
        "unique_count": int(series.nunique()),
    }
    if pd.api.types.is_numeric_dtype(series):
        desc = series.describe()
        stats.update(
            {
                "min": _safe_float(desc.get("min")),
                "max": _safe_float(desc.get("max")),
                "mean": _safe_float(desc.get("mean")),
                "std": _safe_float(desc.get("std")),
                "p25": _safe_float(desc.get("25%")),
                "p75": _safe_float(desc.get("75%")),
            }
        )
    return stats


def _safe_float(v) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
        return None if math.isnan(f) or math.isinf(f) else round(f, 4)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Individual checks
# ---------------------------------------------------------------------------


def _check_missing(df: pd.DataFrame) -> list[Finding]:
    findings = []
    total = len(df)
    for col in df.columns:
        missing = int(df[col].isna().sum())
        if missing == 0:
            continue
        # Sample: row indices where value is missing
        missing_idx = df.index[df[col].isna()].tolist()[:5]
        findings.append(
            Finding(
                issue_type="missing_values",
                affected_column=col,
                affected_count=missing,
                severity=_severity(missing, total),
                description=(
                    f"Column '{col}' has {missing} missing value(s) "
                    f"({missing / total * 100:.1f}% of rows)."
                ),
                sample_evidence=[{"row_index": i} for i in missing_idx],
            )
        )
    return findings


def _check_duplicates(df: pd.DataFrame) -> list[Finding]:
    dup_mask = df.duplicated(keep="first")
    dup_count = int(dup_mask.sum())
    if dup_count == 0:
        return []
    sample_rows = (
        df[dup_mask]
        .head(5)
        .to_dict(orient="records")
    )
    # Convert numpy types
    clean_rows = []
    for row in sample_rows:
        clean_rows.append(
            {k: (v.item() if hasattr(v, "item") else v) for k, v in row.items()}
        )
    return [
        Finding(
            issue_type="duplicates",
            affected_column=None,
            affected_count=dup_count,
            severity=_severity(dup_count, len(df)),
            description=f"{dup_count} exact duplicate row(s) detected.",
            sample_evidence=clean_rows,
        )
    ]


# Heuristic sets for domain validation
_NEGATIVE_DISALLOWED = {
    "quantity", "qty", "amount", "price", "cost", "revenue",
    "sales", "units", "count", "total", "discount",
}
_DATE_COLS = {"date", "order_date", "sale_date", "created_at", "timestamp", "dob"}
_STATUS_COLS = {"status", "order_status", "payment_status"}
_EMAIL_COLS = {"email", "email_address", "customer_email"}
_ALLOWED_STATUSES = {
    "pending", "shipped", "delivered", "cancelled", "canceled",
    "returned", "processing", "completed", "active", "inactive",
}


def _check_invalid_values(df: pd.DataFrame) -> list[Finding]:
    findings = []
    total = len(df)
    now = pd.Timestamp.now()

    for col in df.columns:
        col_lower = col.lower().strip()
        series = df[col]

        # --- Negative values in amount/quantity columns ---
        if any(kw in col_lower for kw in _NEGATIVE_DISALLOWED):
            num_series = pd.to_numeric(series, errors="coerce")
            if num_series.notna().any():
                neg_mask = num_series < 0
                neg_count = int(neg_mask.sum())
                if neg_count > 0:
                    findings.append(
                        Finding(
                            issue_type="invalid_values",
                            affected_column=col,
                            affected_count=neg_count,
                            severity=_severity(neg_count, total),
                            description=(
                                f"Column '{col}' contains {neg_count} negative value(s), "
                                f"which are invalid for this field."
                            ),
                            sample_evidence=_sample(series[neg_mask]),
                        )
                    )

        # --- Future dates ---
        if any(kw in col_lower for kw in _DATE_COLS):
            parsed = pd.to_datetime(series, errors="coerce")
            if parsed.notna().any():
                future_mask = parsed > now
                future_count = int(future_mask.sum())
                if future_count > 0:
                    findings.append(
                        Finding(
                            issue_type="invalid_values",
                            affected_column=col,
                            affected_count=future_count,
                            severity=_severity(future_count, total),
                            description=(
                                f"Column '{col}' has {future_count} future date(s) "
                                f"that are later than today."
                            ),
                            sample_evidence=[
                                str(v) for v in parsed[future_mask].head(5).tolist()
                            ],
                        )
                    )

        # --- Invalid email format ---
        if any(kw in col_lower for kw in _EMAIL_COLS):
            # Use fullmatch via the anchored regex so the entire cell must match.
            str_col = series.astype(str)
            bad_mask_full = series.notna() & ~str_col.apply(
                lambda v: bool(_EMAIL_RE.fullmatch(v.strip())) if isinstance(v, str) else False
            )
            bad_count = int(bad_mask_full.sum())
            if bad_count > 0:
                findings.append(
                    Finding(
                        issue_type="invalid_values",
                        affected_column=col,
                        affected_count=bad_count,
                        severity=_severity(bad_count, total),
                        description=(
                            f"Column '{col}' has {bad_count} value(s) that do not "
                            f"match a valid email address format."
                        ),
                        sample_evidence=_sample(series[bad_mask_full]),
                    )
                )

        # --- Unexpected status values ---
        if any(kw == col_lower for kw in _STATUS_COLS):
            str_series = series.dropna().astype("string").str.lower().str.strip()
            bad_mask = series.notna() & ~str_series.isin(_ALLOWED_STATUSES)
            bad_count = int(bad_mask.sum())
            if bad_count > 0:
                findings.append(
                    Finding(
                        issue_type="invalid_values",
                        affected_column=col,
                        affected_count=bad_count,
                        severity=_severity(bad_count, total),
                        description=(
                            f"Column '{col}' has {bad_count} value(s) outside the "
                            f"expected set: {sorted(_ALLOWED_STATUSES)}."
                        ),
                        sample_evidence=_sample(series[bad_mask]),
                    )
                )

    return findings


def _check_outliers(df: pd.DataFrame) -> list[Finding]:
    """IQR-based outlier detection for numeric columns."""
    findings = []
    total = len(df)

    for col in df.columns:
        series = pd.to_numeric(df[col], errors="coerce").dropna()
        if len(series) < 10:          # not enough data for meaningful IQR
            continue

        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)
        iqr = q3 - q1

        if iqr == 0:                  # constant column – no meaningful outliers
            continue

        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr

        # Map back to original DataFrame index
        full_series = pd.to_numeric(df[col], errors="coerce")
        outlier_mask = (full_series < lower) | (full_series > upper)
        outlier_count = int(outlier_mask.sum())

        if outlier_count == 0:
            continue

        findings.append(
            Finding(
                issue_type="outliers",
                affected_column=col,
                affected_count=outlier_count,
                severity=_severity(outlier_count, total),
                description=(
                    f"Column '{col}' has {outlier_count} statistical outlier(s) "
                    f"(IQR method: expected range [{lower:.2f}, {upper:.2f}]). "
                    f"Q1={q1:.2f}, Q3={q3:.2f}, IQR={iqr:.2f}."
                ),
                sample_evidence=_sample(full_series[outlier_mask]),
            )
        )

    return findings


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def compute_quality_score(findings: list[Finding], total_rows: int) -> float:
    """
    Score from 0–100.
    Each finding deducts points weighted by severity and fraction of rows affected.
    severity weights: critical=40, high=20, medium=10, low=5
    """
    if total_rows == 0:
        return 0.0

    WEIGHTS = {"critical": 40, "high": 20, "medium": 10, "low": 5}
    penalty = 0.0

    for f in findings:
        w = WEIGHTS.get(f.severity, 5)
        fraction = min(f.affected_count / total_rows, 1.0)
        penalty += w * fraction

    return max(0.0, round(100.0 - penalty, 1))


def analyze(df: pd.DataFrame) -> ScanResult:
    """
    Run the complete data-quality pipeline on a DataFrame.
    Returns a ScanResult with findings and per-column statistics.
    """
    findings: list[Finding] = []
    findings.extend(_check_missing(df))
    findings.extend(_check_duplicates(df))
    findings.extend(_check_invalid_values(df))
    findings.extend(_check_outliers(df))

    col_stats = {col: _col_stats(df[col]) for col in df.columns}
    score = compute_quality_score(findings, len(df))

    return ScanResult(
        row_count=len(df),
        col_count=len(df.columns),
        quality_score=score,
        total_issues=len(findings),
        findings=findings,
        column_stats=col_stats,
    )
