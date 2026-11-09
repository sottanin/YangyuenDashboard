export const TOKEN_HISTORY_EXPORT_LIMIT = 50_000

export class TokenHistoryExportLimitError extends Error {
  constructor() {
    super('More than 50,000 events match. Narrow the date range or search before exporting.')
    this.name = 'TokenHistoryExportLimitError'
  }
}
