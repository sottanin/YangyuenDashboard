import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { allowedWorkspaceIds, canAccessChart, canAccessMenu, getCurrentAdmin } from '@/lib/auth/admin'
import { prisma } from '@/lib/prisma'
import { getReportDateBounds, parseReportDateRange, ReportPeriodError } from '@/lib/reporting/reportPeriod'

interface TotalRow {
  steps_total: Prisma.Decimal
  steps_users: bigint
  calories_total: Prisma.Decimal
  calories_users: bigint
  sleep_total: Prisma.Decimal
  sleep_users: bigint
}
interface DailyRow { date: string; metric: string; total: Prisma.Decimal; user_count: bigint }
interface TopRow { metric: string; user_id: string; total: Prisma.Decimal }
interface DistributionRow { metric: string; bucket: number; user_count: bigint }
interface UserSummaryRow {
  user_id: string
  total_steps: Prisma.Decimal
  average_steps: Prisma.Decimal
  total_calories: Prisma.Decimal
  average_calories: Prisma.Decimal
  total_sleep: Prisma.Decimal
  average_sleep: Prisma.Decimal
}

const SLEEP_TYPES = ['sleep_deep', 'sleep_light', 'sleep_rem']

function average(total: Prisma.Decimal, users: bigint): string {
  return users === BigInt(0) ? '0' : total.div(users.toString()).toString()
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const admin = await getCurrentAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canAccessMenu(admin, 'fitivity-overview')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const workspaceId = Number(request.nextUrl.searchParams.get('workspace'))
    if (!Number.isInteger(workspaceId) || workspaceId < 1) return NextResponse.json({ error: 'Select a workspace' }, { status: 400 })
    const allowed = allowedWorkspaceIds(admin)
    if (allowed !== null && !allowed.includes(workspaceId)) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, name: true } })
    if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

    const range = await parseReportDateRange(request.nextUrl.searchParams)
    const bounds = await getReportDateBounds()
    const visibility = {
      totalSteps: canAccessChart(admin, 'fitivity.total-steps'),
      totalCalories: canAccessChart(admin, 'fitivity.total-calories'),
      totalSleep: canAccessChart(admin, 'fitivity.total-sleep'),
      stepsTrend: canAccessChart(admin, 'fitivity.steps-trend'),
      caloriesTrend: canAccessChart(admin, 'fitivity.calories-trend'),
      sleepTrend: canAccessChart(admin, 'fitivity.sleep-trend'),
      topSteps: canAccessChart(admin, 'fitivity.top-steps'),
      topCalories: canAccessChart(admin, 'fitivity.top-calories'),
      topSleep: canAccessChart(admin, 'fitivity.top-sleep'),
      stepsDistribution: canAccessChart(admin, 'fitivity.steps-distribution'),
      caloriesDistribution: canAccessChart(admin, 'fitivity.calories-distribution'),
      sleepDistribution: canAccessChart(admin, 'fitivity.sleep-distribution'),
      userSummary: canAccessChart(admin, 'fitivity.user-summary'),
    }
    const needsTotals = visibility.totalSteps || visibility.totalCalories || visibility.totalSleep
    const needsDaily = visibility.stepsTrend || visibility.caloriesTrend || visibility.sleepTrend
    const needsTop = visibility.topSteps || visibility.topCalories || visibility.topSleep
    const needsDistribution = visibility.stepsDistribution || visibility.caloriesDistribution || visibility.sleepDistribution
    const needsUserSummary = visibility.userSummary

    const [totalRows, dailyRows, topRows, distributionRows, userSummaryRows] = await Promise.all([
      needsTotals ? prisma.$queryRaw<TotalRow[]>(Prisma.sql`
        SELECT
          COALESCE(SUM("totalValue") FILTER (WHERE "metricType"='steps'),0) steps_total,
          COUNT(DISTINCT "userId") FILTER (WHERE "metricType"='steps')::bigint steps_users,
          COALESCE(SUM("totalValue") FILTER (WHERE "metricType"='active_energy_burned'),0) calories_total,
          COUNT(DISTINCT "userId") FILTER (WHERE "metricType"='active_energy_burned')::bigint calories_users,
          COALESCE(SUM("totalValue") FILTER (WHERE "metricType" IN (${Prisma.join(SLEEP_TYPES)})),0)/60 sleep_total,
          COUNT(DISTINCT "userId") FILTER (WHERE "metricType" IN (${Prisma.join(SLEEP_TYPES)}))::bigint sleep_users
        FROM "FitivityData"
        WHERE "workspaceId"=${workspaceId} AND "isCal"=true AND date BETWEEN ${range.from}::date AND ${range.to}::date
      `) : Promise.resolve([] as TotalRow[]),
      needsDaily ? prisma.$queryRaw<DailyRow[]>(Prisma.sql`
        WITH base AS (
          SELECT date,"userId",
            CASE WHEN "metricType"='steps' THEN 'steps' WHEN "metricType"='active_energy_burned' THEN 'calories' ELSE 'sleep' END metric,
            CASE WHEN "metricType" IN (${Prisma.join(SLEEP_TYPES)}) THEN "totalValue"/60 ELSE "totalValue" END value
          FROM "FitivityData"
          WHERE "workspaceId"=${workspaceId} AND "isCal"=true AND date BETWEEN ${range.from}::date AND ${range.to}::date
            AND "metricType" IN ('steps','active_energy_burned',${Prisma.join(SLEEP_TYPES)})
        )
        SELECT TO_CHAR(date, 'YYYY-MM-DD') date,metric,SUM(value) total,COUNT(DISTINCT "userId")::bigint user_count
        FROM base GROUP BY date,metric ORDER BY date
      `) : Promise.resolve([] as DailyRow[]),
      needsTop ? prisma.$queryRaw<TopRow[]>(Prisma.sql`
        WITH base AS (
          SELECT "userId",
            CASE WHEN "metricType"='steps' THEN 'steps' WHEN "metricType"='active_energy_burned' THEN 'calories' ELSE 'sleep' END metric,
            CASE WHEN "metricType" IN (${Prisma.join(SLEEP_TYPES)}) THEN "totalValue"/60 ELSE "totalValue" END value
          FROM "FitivityData"
          WHERE "workspaceId"=${workspaceId} AND "isCal"=true AND date BETWEEN ${range.from}::date AND ${range.to}::date
            AND "metricType" IN ('steps','active_energy_burned',${Prisma.join(SLEEP_TYPES)})
        ), totals AS (SELECT metric,"userId" user_id,SUM(value) total FROM base GROUP BY metric,"userId"),
        ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY metric ORDER BY total DESC,user_id) rank FROM totals)
        SELECT metric,user_id,total FROM ranked WHERE rank<=10 ORDER BY metric,rank
      `) : Promise.resolve([] as TopRow[]),
      needsDistribution ? prisma.$queryRaw<DistributionRow[]>(Prisma.sql`
        WITH base AS (
          SELECT date,"userId",
            CASE WHEN "metricType"='steps' THEN 'steps' WHEN "metricType"='active_energy_burned' THEN 'calories' ELSE 'sleep' END metric,
            CASE WHEN "metricType" IN (${Prisma.join(SLEEP_TYPES)}) THEN "totalValue"/60 ELSE "totalValue" END value
          FROM "FitivityData"
          WHERE "workspaceId"=${workspaceId} AND "isCal"=true AND date BETWEEN ${range.from}::date AND ${range.to}::date
            AND "metricType" IN ('steps','active_energy_burned',${Prisma.join(SLEEP_TYPES)})
        ), daily AS (
          SELECT date,"userId",metric,SUM(value) daily_total FROM base GROUP BY date,"userId",metric
        ), user_averages AS (
          SELECT "userId",metric,AVG(daily_total) daily_average FROM daily GROUP BY "userId",metric
        ), bucketed AS (
          SELECT metric,
            CASE
              WHEN metric='steps' THEN CASE WHEN daily_average<=2000 THEN 0 WHEN daily_average<=4000 THEN 1 WHEN daily_average<=6000 THEN 2 WHEN daily_average<=8000 THEN 3 WHEN daily_average<=10000 THEN 4 WHEN daily_average<=20000 THEN 5 ELSE 6 END
              WHEN metric='calories' THEN CASE WHEN daily_average<=100 THEN 0 WHEN daily_average<=200 THEN 1 WHEN daily_average<=300 THEN 2 WHEN daily_average<=400 THEN 3 WHEN daily_average<=500 THEN 4 ELSE 5 END
              ELSE CASE WHEN daily_average<4 THEN 0 WHEN daily_average<7 THEN 1 ELSE 2 END
            END bucket
          FROM user_averages
        )
        SELECT metric,bucket,COUNT(*)::bigint user_count FROM bucketed GROUP BY metric,bucket ORDER BY metric,bucket
      `) : Promise.resolve([] as DistributionRow[]),
      needsUserSummary ? prisma.$queryRaw<UserSummaryRow[]>(Prisma.sql`
        WITH base AS (
          SELECT date,"userId",
            CASE WHEN "metricType"='steps' THEN 'steps' WHEN "metricType"='active_energy_burned' THEN 'calories' ELSE 'sleep' END metric,
            CASE WHEN "metricType" IN (${Prisma.join(SLEEP_TYPES)}) THEN "totalValue"/60 ELSE "totalValue" END value
          FROM "FitivityData"
          WHERE "workspaceId"=${workspaceId} AND "isCal"=true
            AND date BETWEEN ${range.from}::date AND ${range.to}::date
            AND "metricType" IN ('steps','active_energy_burned',${Prisma.join(SLEEP_TYPES)})
        ), daily AS (
          SELECT date,"userId",metric,SUM(value) daily_total FROM base GROUP BY date,"userId",metric
        ), per_user AS (
          SELECT "userId",metric,SUM(daily_total) total,AVG(daily_total) average FROM daily GROUP BY "userId",metric
        )
        SELECT "userId" user_id,
          COALESCE(MAX(total) FILTER (WHERE metric='steps'),0) total_steps,
          COALESCE(MAX(average) FILTER (WHERE metric='steps'),0) average_steps,
          COALESCE(MAX(total) FILTER (WHERE metric='calories'),0) total_calories,
          COALESCE(MAX(average) FILTER (WHERE metric='calories'),0) average_calories,
          COALESCE(MAX(total) FILTER (WHERE metric='sleep'),0) total_sleep,
          COALESCE(MAX(average) FILTER (WHERE metric='sleep'),0) average_sleep
        FROM per_user GROUP BY "userId" ORDER BY "userId"
      `) : Promise.resolve([] as UserSummaryRow[]),
    ])

    const totals = totalRows[0] ?? {
      steps_total: new Prisma.Decimal(0), steps_users: BigInt(0), calories_total: new Prisma.Decimal(0), calories_users: BigInt(0), sleep_total: new Prisma.Decimal(0), sleep_users: BigInt(0),
    }
    const dailyByMetric = new Map<string, Array<{ date: string; average: string; accumulated: string }>>()
    const running = new Map<string, Prisma.Decimal>()
    for (const row of dailyRows) {
      const accumulated = (running.get(row.metric) ?? new Prisma.Decimal(0)).add(row.total)
      running.set(row.metric, accumulated)
      const points = dailyByMetric.get(row.metric) ?? []
      points.push({ date: row.date, average: average(row.total, row.user_count), accumulated: accumulated.toString() })
      dailyByMetric.set(row.metric, points)
    }
    const topByMetric = (metric: string): Array<{ label: string; value: string }> => topRows.filter((row) => row.metric === metric).map((row) => ({ label: row.user_id, value: row.total.toString() }))
    const distributionLabels: Record<string, string[]> = {
      steps: ['0–2,000 steps/day', '2,001–4,000 steps/day', '4,001–6,000 steps/day', '6,001–8,000 steps/day', '8,001–10,000 steps/day', '10,001–20,000 steps/day', '20,001+ steps/day'],
      calories: ['0–100 kcal/day', '101–200 kcal/day', '201–300 kcal/day', '301–400 kcal/day', '401–500 kcal/day', '501+ kcal/day'],
      sleep: ['0–3 hrs/day', '4–6 hrs/day', '7+ hrs/day'],
    }
    const distributionByMetric = (metric: string): Array<{ label: string; count: number }> => {
      const counts = new Map(distributionRows.filter((row) => row.metric === metric).map((row) => [row.bucket, Number(row.user_count)]))
      return distributionLabels[metric].map((label, bucket) => ({ label, count: counts.get(bucket) ?? 0 }))
    }

    return NextResponse.json({
      workspace,
      period: { from: range.from, to: range.to, ...bounds },
      visibility,
      kpis: {
        steps: visibility.totalSteps ? { total: totals.steps_total.toString(), average: average(totals.steps_total, totals.steps_users), users: Number(totals.steps_users) } : null,
        calories: visibility.totalCalories ? { total: totals.calories_total.toString(), average: average(totals.calories_total, totals.calories_users), users: Number(totals.calories_users) } : null,
        sleep: visibility.totalSleep ? { total: totals.sleep_total.toString(), average: average(totals.sleep_total, totals.sleep_users), users: Number(totals.sleep_users) } : null,
      },
      trends: {
        steps: visibility.stepsTrend ? dailyByMetric.get('steps') ?? [] : [],
        calories: visibility.caloriesTrend ? dailyByMetric.get('calories') ?? [] : [],
        sleep: visibility.sleepTrend ? dailyByMetric.get('sleep') ?? [] : [],
      },
      topUsers: {
        steps: visibility.topSteps ? topByMetric('steps') : [],
        calories: visibility.topCalories ? topByMetric('calories') : [],
        sleep: visibility.topSleep ? topByMetric('sleep') : [],
      },
      distributions: {
        steps: visibility.stepsDistribution ? distributionByMetric('steps') : [],
        calories: visibility.caloriesDistribution ? distributionByMetric('calories') : [],
        sleep: visibility.sleepDistribution ? distributionByMetric('sleep') : [],
      },
      userSummary: visibility.userSummary ? userSummaryRows.map((row) => ({
        userId: row.user_id,
        totalSteps: row.total_steps.toString(),
        averageSteps: row.average_steps.toString(),
        totalCalories: row.total_calories.toString(),
        averageCalories: row.average_calories.toString(),
        totalSleep: row.total_sleep.toString(),
        averageSleep: row.average_sleep.toString(),
      })) : [],
    })
  } catch (error) {
    if (error instanceof ReportPeriodError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Fitivity overview error:', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json({ error: 'Unable to load Fitivity overview' }, { status: 500 })
  }
}
