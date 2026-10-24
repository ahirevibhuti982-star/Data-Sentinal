/**
 * App.jsx
 * Root application shell.
 * - Manages global state: active scan, scan history list, selected tab.
 * - Renders the sidebar, topbar, upload panel, and dashboard.
 * - Polls backend health on mount to show connectivity status.
 */
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, List, Database, Clock,
  Upload, RefreshCw,
} from 'lucide-react'
import Dashboard from './components/Dashboard.jsx'
import UploadPanel from './components/UploadPanel.jsx'
import ScanHistory from './components/ScanHistory.jsx'
import { listScans, healthCheck } from './api.js'

const TABS = [
  { id: 'overview',  label: 'Overview',    Icon: LayoutDashboard },
  { id: 'findings',  label: 'Findings',    Icon: List },
  { id: 'columns',   label: 'Columns',     Icon: Database },
]

export default function App() {
  const [activeTab, setActiveTab]       = useState('overview')
  const [activeScan, setActiveScan]     = useState(null)
  const [scans, setScans]               = useState([])
  const [showHistory, setShowHistory]   = useState(false)
  const [backendOk, setBackendOk]       = useState(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Health check on mount
  useEffect(() => {
    healthCheck()
      .then(() => setBackendOk(true))
      .catch(() => setBackendOk(false))
  }, [])

  // Load scan history
  async function refreshHistory() {
    setLoadingHistory(true)
    try {
      const data = await listScans()
      setScans(data)
    } catch { /* backend may not be up yet */ }
    finally { setLoadingHistory(false) }
  }

  useEffect(() => { refreshHistory() }, [])

  function handleScanComplete(scan) {
    setActiveScan(scan)
    setActiveTab('overview')
    refreshHistory()
  }

  const topbarTitle =
    activeScan
      ? activeScan.filename
      : 'DataSentinel'

  const topbarSub =
    activeScan
      ? `${activeScan.row_count.toLocaleString()} rows · ${activeScan.col_count} columns · score ${activeScan.quality_score}`
      : 'Business data quality monitoring'

  return (
    <div className="app-shell">
      {/* ===== Sidebar ===== */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🛡️</div>
          <div>
            <div className="sidebar-logo-text">DataSentinel</div>
            <div className="sidebar-logo-sub">Quality Monitor</div>
          </div>
        </div>

        <div className="nav-section-label">Monitor</div>
        {TABS.map(({ id, label, Icon }) => (
          <div
            key={id}
            id={`nav-${id}`}
            className={`nav-item${activeTab === id ? ' active' : ''}`}
            onClick={() => { setActiveTab(id); setShowHistory(false) }}
          >
            <Icon size={17} />
            {label}
          </div>
        ))}

        <div className="nav-section-label" style={{ marginTop: 24 }}>Actions</div>
        <div
          id="nav-history"
          className={`nav-item${showHistory ? ' active' : ''}`}
          onClick={() => { setShowHistory(true); setActiveTab('overview') }}
        >
          <Clock size={17} />
          Scan History
        </div>

        <div className="sidebar-bottom">
          <div className="backend-status">
            <div
              className={`status-dot${backendOk === true ? ' online' : backendOk === false ? ' offline' : ''}`}
            />
            {backendOk === true ? 'API connected' : backendOk === false ? 'API offline' : 'Connecting…'}
          </div>
        </div>
      </aside>

      {/* ===== Top bar ===== */}
      <header className="topbar">
        <div>
          <div className="topbar-title">{topbarTitle}</div>
          <div className="topbar-sub">{topbarSub}</div>
        </div>
        <div className="flex gap-2 items-center">
          <button
            className="btn btn-ghost btn-sm"
            onClick={refreshHistory}
            disabled={loadingHistory}
            title="Refresh scan history"
          >
            <RefreshCw size={14} style={{ animation: loadingHistory ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => { setActiveTab('overview'); setShowHistory(false) }}
          >
            <Upload size={14} />
            New Scan
          </button>
        </div>
      </header>

      {/* ===== Main content ===== */}
      <main className="main-content">
        {/* Upload panel shown on all non-history tabs */}
        {!showHistory && (
          <UploadPanel onScanComplete={handleScanComplete} />
        )}

        {/* History view */}
        {showHistory && (
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header">
              <div className="card-title">
                <Clock size={17} color="var(--color-indigo-light)" />
                Scan History
              </div>
              <div className="card-subtitle">{scans.length} scan(s)</div>
            </div>
            <ScanHistory
              scans={scans}
              activeScanId={activeScan?.id}
              onSelect={(scan) => {
                setActiveScan(scan)
                setShowHistory(false)
                setActiveTab('overview')
              }}
            />
          </div>
        )}

        {/* Dashboard (only when not in history view) */}
        {!showHistory && (
          <Dashboard scan={activeScan} activeTab={activeTab} />
        )}
      </main>
    </div>
  )
}
