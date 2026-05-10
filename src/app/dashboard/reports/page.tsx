import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'

const REPORTS = [
  { name: 'Q1 2024 Token Activity Summary', type: 'Blockchain', date: 'Apr 02', size: '2.4 MB', format: 'PDF' },
  { name: 'Wallet Cohort Analysis', type: 'Behavioral', date: 'Apr 28', size: '1.1 MB', format: 'CSV' },
  { name: 'Token Distribution Report', type: 'Financial', date: 'May 01', size: '3.8 MB', format: 'PDF' },
  { name: 'Redemption Audit', type: 'Operational', date: 'May 03', size: '780 KB', format: 'XLSX' },
  { name: 'Gas Usage Analysis', type: 'Technical', date: 'May 06', size: '1.6 MB', format: 'PDF' },
]

const FORMAT_COLORS: Record<string, string> = {
  PDF: 'pill-danger',
  CSV: 'pill-success',
  XLSX: 'pill-warn',
}

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Generated analytics and audit reports for Yangyuen blockchain data"
        actions={
          <>
            <button className="btn btn-ghost"><Icon name="filter" size={14} />Filter</button>
            <button className="btn btn-primary"><Icon name="plus" size={14} />New Report</button>
          </>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Reports', value: '5', icon: 'doc', color: 'rgb(99 102 241 / 0.12)', textColor: 'rgb(var(--accent))' },
          { label: 'This Month', value: '3', icon: 'activity', color: 'rgb(16 185 129 / 0.12)', textColor: 'rgb(var(--success))' },
          { label: 'Total Size', value: '9.7 MB', icon: 'box', color: 'rgb(245 158 11 / 0.12)', textColor: 'rgb(var(--warn))' },
        ].map((s) => (
          <div key={s.label} className="glass rounded-2xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: s.color, color: s.textColor }}>
              <Icon name={s.icon} size={18} />
            </div>
            <div>
              <div className="text-xs text-muted uppercase tracking-wider">{s.label}</div>
              <div className="text-2xl font-semibold tracking-tight text-default mt-0.5">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      <Card title="Available Reports" subtitle="Click to download" noPad>
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wider text-faint border-b border-default">
                <th className="text-left font-medium px-5 py-3">Report Name</th>
                <th className="text-left font-medium px-3 py-3">Type</th>
                <th className="text-left font-medium px-3 py-3">Date</th>
                <th className="text-left font-medium px-3 py-3">Size</th>
                <th className="text-left font-medium px-3 py-3">Format</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {REPORTS.map((r, i) => (
                <tr key={i} className="tbl-row border-b border-default last:border-0">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgb(var(--accent) / 0.12)', color: 'rgb(var(--accent))' }}>
                        <Icon name="doc" size={14} />
                      </div>
                      <span className="text-xs font-medium text-default">{r.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3"><span className="pill pill-muted">{r.type}</span></td>
                  <td className="px-3 py-3 text-xs text-muted">{r.date}</td>
                  <td className="px-3 py-3 text-xs text-muted font-mono">{r.size}</td>
                  <td className="px-3 py-3">
                    <span className={`pill ${FORMAT_COLORS[r.format] || 'pill-muted'}`}>{r.format}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '11px' }}>
                      <Icon name="download" size={12} />Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
