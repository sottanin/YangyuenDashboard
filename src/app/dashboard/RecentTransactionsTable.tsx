'use client'

interface TxRow {
  txId: string
  fromHash: string
  toHash: string
  tokenName: string
  value: string
  timestamp: Date | string
  status: string | null
  txType: string
}

function trunc(s: string, n = 12) {
  if (!s || s.length <= n) return s
  return s.slice(0, 6) + '...' + s.slice(-4)
}

function fmtTime(d: Date | string) {
  const date = new Date(d)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_PILL: Record<string, string> = {
  success: 'pill-success',
  ok: 'pill-success',
  error: 'pill-danger',
  pending: 'pill-warn',
}

export function RecentTransactionsTable({ rows }: { rows: TxRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-3xl mb-2">📭</div>
        <div className="text-sm font-medium text-default">No transactions found</div>
        <div className="text-xs text-muted mt-1">Seed the database to populate data</div>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto thin-scroll">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wider text-faint border-b border-default">
            <th className="text-left font-medium px-5 py-3">TX ID</th>
            <th className="text-left font-medium px-3 py-3">From</th>
            <th className="text-left font-medium px-3 py-3">Token</th>
            <th className="text-right font-medium px-3 py-3">Value</th>
            <th className="text-left font-medium px-3 py-3">Type</th>
            <th className="text-left font-medium px-3 py-3">Date</th>
            <th className="text-left font-medium px-3 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const statusKey = (r.status || 'ok').toLowerCase()
            const pillClass = STATUS_PILL[statusKey] || 'pill-muted'
            const typeClass = r.txType === 'token_minting' ? 'pill-accent' : 'pill-muted'
            return (
              <tr key={r.txId} className="tbl-row border-b border-default last:border-0">
                <td className="px-5 py-3 font-mono text-xs text-default">{trunc(r.txId, 14)}</td>
                <td className="px-3 py-3 font-mono text-xs text-muted">{trunc(r.fromHash, 14)}</td>
                <td className="px-3 py-3 text-xs text-default">{r.tokenName}</td>
                <td className="px-3 py-3 text-right font-mono text-xs text-default">
                  {parseFloat(r.value).toFixed(2)}
                </td>
                <td className="px-3 py-3">
                  <span className={`pill ${typeClass}`}>
                    {r.txType === 'token_minting' ? 'Mint' : 'Transfer'}
                  </span>
                </td>
                <td className="px-3 py-3 text-xs text-muted">{fmtTime(r.timestamp)}</td>
                <td className="px-3 py-3">
                  <span className={`pill ${pillClass}`}>{r.status || 'ok'}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
