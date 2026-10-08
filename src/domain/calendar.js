const escape = (value) =>
  String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n|\r/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
const stamp = (value) =>
  new Date(value)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
export function foldLine(line) {
  const lines = [];
  let part = '',
    size = 0;
  for (const char of line) {
    const bytes = new TextEncoder().encode(char).length;
    if (size + bytes > 75) {
      lines.push(part);
      part = ' ';
      size = 1;
    }
    part += char;
    size += bytes;
  }
  lines.push(part);
  return lines.join('\r\n');
}
export function calendarFile({
  title,
  description,
  start,
  end,
  location = '',
  uid = crypto.randomUUID(),
  now = new Date(),
}) {
  if (
    !title.trim() ||
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    new Date(end) <= new Date(start)
  )
    throw Error('Enter a title and an end time after the start time.');
  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Brief//Project Reporting//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${escape(uid)}@brief.local`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escape(title)}`,
      `DESCRIPTION:${escape(description)}`,
      `LOCATION:${escape(location)}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .map(foldLine)
      .join('\r\n') + '\r\n'
  );
}
