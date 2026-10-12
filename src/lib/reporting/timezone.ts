interface DateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function partsInTimeZone(date: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

/** Returns the UTC instant at which the calendar day begins in an IANA timezone. */
export function startOfDayInTimeZone(date: Date, timeZone: string): Date {
  const localDate = partsInTimeZone(date, timeZone)
  const targetLocalAsUtc = Date.UTC(localDate.year, localDate.month - 1, localDate.day)
  let candidate = targetLocalAsUtc

  // Resolve the zone offset at the target instant. Repeating handles offset
  // changes close to midnight without depending on the host timezone.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = partsInTimeZone(new Date(candidate), timeZone)
    const observedLocalAsUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second)
    const correction = targetLocalAsUtc - observedLocalAsUtc
    candidate += correction
    if (correction === 0) break
  }

  return new Date(candidate)
}
