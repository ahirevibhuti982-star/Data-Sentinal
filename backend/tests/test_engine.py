"""
tests/test_engine.py
--------------------
Pytest test suite for the data-quality engine.

Tests cover:
1. Clean data            – no findings expected
2. Missing values        – NaN cells detected per column
3. Duplicate rows        – exact row duplicates counted
4. Invalid values        – negative quantities, future dates, bad emails
5. Statistical outliers  – IQR-based detection
6. Quality score         – score decreases with worse data
7. Empty DataFrame       – graceful handling
"""

import math
import sys
from pathlib import Path

import pandas as pd
import numpy as np
import pytest

# Make sure the backend package is importable when running from any cwd
sys.path.insert(0, str(Path(__file__).parent.parent))

import engine as dq


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_clean_df(n: int = 100) -> pd.DataFrame:
    """Return a clean, valid sales DataFrame with no quality issues."""
    rng = np.random.default_rng(42)
    dates = pd.date_range("2023-01-01", periods=n, freq="D").strftime("%Y-%m-%d")
    return pd.DataFrame(
        {
            "order_id": [f"ORD-{i:04d}" for i in range(n)],
            "order_date": dates,
            "customer_email": [f"user{i}@example.com" for i in range(n)],
            "quantity": rng.integers(1, 50, n).astype(str),
            "price": rng.uniform(10.0, 500.0, n).round(2).astype(str),
            "status": rng.choice(["pending", "shipped", "delivered"], n),
        }
    )


# ---------------------------------------------------------------------------
# 1. Clean data
# ---------------------------------------------------------------------------


def test_clean_data_no_findings():
    df = make_clean_df()
    result = dq.analyze(df)
    # A perfectly clean DataFrame should have zero findings
    assert result.findings == [], f"Expected no findings, got: {result.findings}"
    assert result.quality_score == 100.0


# ---------------------------------------------------------------------------
# 2. Missing values
# ---------------------------------------------------------------------------


def test_missing_values_detected():
    df = make_clean_df(50)
    # Introduce 10 missing values in 'quantity'
    df.loc[[0, 5, 10, 15, 20, 25, 30, 35, 40, 45], "quantity"] = np.nan
    result = dq.analyze(df)
    mv_findings = [f for f in result.findings if f.issue_type == "missing_values"]
    assert len(mv_findings) > 0, "Expected missing-value findings"
    qty_finding = next(
        (f for f in mv_findings if f.affected_column == "quantity"), None
    )
    assert qty_finding is not None, "Expected finding for 'quantity' column"
    assert qty_finding.affected_count == 10


def test_missing_values_severity_critical():
    df = make_clean_df(50)
    # Make 80% of 'price' missing → critical
    df.loc[:39, "price"] = np.nan
    result = dq.analyze(df)
    price_finding = next(
        (
            f
            for f in result.findings
            if f.issue_type == "missing_values" and f.affected_column == "price"
        ),
        None,
    )
    assert price_finding is not None
    assert price_finding.severity == "critical"


# ---------------------------------------------------------------------------
# 3. Duplicate rows
# ---------------------------------------------------------------------------


def test_duplicates_detected():
    df = make_clean_df(20)
    # Append 3 exact duplicates of the first row
    dup = df.iloc[[0, 0, 0]].copy()
    df = pd.concat([df, dup], ignore_index=True)
    result = dq.analyze(df)
    dup_findings = [f for f in result.findings if f.issue_type == "duplicates"]
    assert len(dup_findings) == 1
    assert dup_findings[0].affected_count == 3


def test_no_duplicates_clean_data():
    df = make_clean_df(30)
    result = dq.analyze(df)
    dup_findings = [f for f in result.findings if f.issue_type == "duplicates"]
    assert dup_findings == []


# ---------------------------------------------------------------------------
# 4. Invalid values
# ---------------------------------------------------------------------------


def test_negative_quantity_detected():
    df = make_clean_df(30)
    df.loc[0, "quantity"] = "-5"
    df.loc[5, "quantity"] = "-1"
    result = dq.analyze(df)
    inv = [
        f
        for f in result.findings
        if f.issue_type == "invalid_values" and f.affected_column == "quantity"
    ]
    assert len(inv) == 1
    assert inv[0].affected_count == 2


def test_negative_price_detected():
    df = make_clean_df(30)
    df.loc[3, "price"] = "-99.99"
    result = dq.analyze(df)
    inv = [
        f
        for f in result.findings
        if f.issue_type == "invalid_values" and f.affected_column == "price"
    ]
    assert len(inv) == 1
    assert inv[0].affected_count == 1


def test_future_dates_detected():
    df = make_clean_df(30)
    df.loc[2, "order_date"] = "2099-12-31"
    df.loc[7, "order_date"] = "2150-01-01"
    result = dq.analyze(df)
    inv = [
        f
        for f in result.findings
        if f.issue_type == "invalid_values" and f.affected_column == "order_date"
    ]
    assert len(inv) == 1
    assert inv[0].affected_count == 2


def test_invalid_email_detected():
    df = make_clean_df(20)
    df.loc[1, "customer_email"] = "not-an-email"
    df.loc[4, "customer_email"] = "also@bad"
    result = dq.analyze(df)
    inv = [
        f
        for f in result.findings
        if f.issue_type == "invalid_values" and f.affected_column == "customer_email"
    ]
    assert len(inv) == 1
    assert inv[0].affected_count == 2


def test_invalid_status_detected():
    df = make_clean_df(20)
    df.loc[3, "status"] = "unknown_status"
    result = dq.analyze(df)
    inv = [
        f
        for f in result.findings
        if f.issue_type == "invalid_values" and f.affected_column == "status"
    ]
    assert len(inv) == 1
    assert inv[0].affected_count == 1


# ---------------------------------------------------------------------------
# 5. Outliers
# ---------------------------------------------------------------------------


def test_outliers_detected():
    df = make_clean_df(100)
    # Insert extreme values far outside IQR of price/quantity
    df.loc[0, "price"] = "999999.99"
    df.loc[1, "quantity"] = "99999"
    result = dq.analyze(df)
    outlier_findings = [f for f in result.findings if f.issue_type == "outliers"]
    # We expect at least one outlier finding
    assert len(outlier_findings) >= 1
    affected_cols = {f.affected_column for f in outlier_findings}
    # The extreme values should have triggered outlier detection
    assert "price" in affected_cols or "quantity" in affected_cols


def test_no_outliers_uniform_data():
    """Uniform data within a tight range should produce no outlier findings."""
    df = pd.DataFrame(
        {
            "price": ["10.00"] * 50,
            "quantity": ["5"] * 50,
        }
    )
    result = dq.analyze(df)
    outlier_findings = [f for f in result.findings if f.issue_type == "outliers"]
    assert outlier_findings == []


# ---------------------------------------------------------------------------
# 6. Quality score
# ---------------------------------------------------------------------------


def test_quality_score_decreases_with_issues():
    clean = make_clean_df(100)
    dirty = make_clean_df(100)
    # Add lots of issues
    dirty.loc[:29, "quantity"] = np.nan          # 30% missing
    dirty.loc[0, "price"] = "-1"
    dirty.loc[1, "price"] = "999999"

    clean_result = dq.analyze(clean)
    dirty_result = dq.analyze(dirty)
    assert dirty_result.quality_score < clean_result.quality_score


def test_quality_score_bounded():
    df = make_clean_df(50)
    # Extreme misuse – almost everything is missing
    for col in df.columns:
        df[col] = np.nan
    result = dq.analyze(df)
    assert 0.0 <= result.quality_score <= 100.0


# ---------------------------------------------------------------------------
# 7. Edge cases
# ---------------------------------------------------------------------------


def test_empty_dataframe_handled():
    df = pd.DataFrame()
    result = dq.analyze(df)
    assert result.row_count == 0
    assert result.quality_score == 0.0 or result.quality_score == 100.0  # either is acceptable


def test_single_row_no_outliers():
    """A single-row DataFrame can't produce meaningful IQR – should not crash."""
    df = pd.DataFrame({"price": ["25.00"], "quantity": ["3"]})
    result = dq.analyze(df)
    outlier_findings = [f for f in result.findings if f.issue_type == "outliers"]
    assert outlier_findings == []
