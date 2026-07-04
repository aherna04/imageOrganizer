/** ISO date "YYYY-MM-DD" → "/calendar/Y/M/D" */
export function calendarDayPath(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `/calendar/${year}/${month}/${day}`;
}
