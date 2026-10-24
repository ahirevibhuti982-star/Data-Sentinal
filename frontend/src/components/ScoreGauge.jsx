/**
 * ScoreGauge.jsx
 * Displays the overall data-quality score as a radial arc (SVG) + numeric.
 * Uses a Recharts PieChart for the arc so it integrates with the chart theme.
 */
import { PieChart, Pie, Cell } from 'recharts'

const SCORE_COLORS = {
  excellent: '#22c55e',
  good:      '#06b6d4',
  fair:      '#eab308',
  poor:      '#f97316',
  critical:  '#ef4444',
}

function scoreColor(score) {
  if (score >= 90) return SCORE_COLORS.excellent
  if (score >= 75) return SCORE_COLORS.good
  if (score >= 55) return SCORE_COLORS.fair
  if (score >= 30) return SCORE_COLORS.poor
  return SCORE_COLORS.critical
}

function scoreLabel(score) {
  if (score >= 90) return 'Excellent'
  if (score >= 75) return 'Good'
  if (score >= 55) return 'Fair'
  if (score >= 30) return 'Poor'
  return 'Critical'
}

export default function ScoreGauge({ score }) {
  const s = score ?? 0
  const color = scoreColor(s)
  const filled = s
  const empty = 100 - s

  const data = [
    { value: filled },
    { value: empty },
  ]

  return (
    <div className="gauge-wrap">
      <div style={{ position: 'relative', width: 140, height: 140 }}>
        <PieChart width={140} height={140}>
          <Pie
            data={data}
            cx={65}
            cy={65}
            innerRadius={48}
            outerRadius={62}
            startAngle={220}
            endAngle={-40}
            dataKey="value"
            strokeWidth={0}
          >
            <Cell fill={color} />
            <Cell fill="rgba(99,120,180,0.1)" />
          </Pie>
        </PieChart>
        {/* Center text */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>
            {s.toFixed(0)}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>/ 100</span>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>Quality score</div>
        <div style={{ fontSize: 22, fontWeight: 800, color }}>{scoreLabel(s)}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          Weighted penalty model
        </div>
      </div>
    </div>
  )
}
