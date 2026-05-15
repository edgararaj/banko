export function formatDateDisplay(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  // Show the stored date string as-is (strip any time component)
  return String(dateStr).split('T')[0];
}

export function parseDateStringToMs(dateStr: string | undefined | null): number {
  if (!dateStr) return NaN;
  const s = String(dateStr).trim();
  // ISO YYYY-MM-DD or full ISO
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    return Date.UTC(y, m - 1, d);
  }
  // dd-mm-yyyy or dd/mm/yyyy or d-m-yy
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10);
    let year = dmy[3].length === 2 ? 2000 + parseInt(dmy[3], 10) : parseInt(dmy[3], 10);
    return Date.UTC(year, month - 1, day);
  }
  // dd-mm without year -> assume current year
  const dmy2 = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (dmy2) {
    const day = parseInt(dmy2[1], 10);
    const month = parseInt(dmy2[2], 10);
    const year = new Date().getFullYear();
    return Date.UTC(year, month - 1, day);
  }
  // fallback to Date parse
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? NaN : fallback.getTime();
}
