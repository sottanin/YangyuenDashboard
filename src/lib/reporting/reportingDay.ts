import { Prisma } from '@prisma/client'

/**
 * TransactionDetail.timestamp is a PostgreSQL `timestamp without time zone`
 * containing a UTC wall-clock value. Interpret that value as UTC first, then
 * convert the instant into the configured reporting timezone before taking the
 * calendar date.
 */
export function reportingDaySql(timestampColumn: Prisma.Sql, timezone: string): Prisma.Sql {
  return Prisma.sql`(${timestampColumn} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date`
}
