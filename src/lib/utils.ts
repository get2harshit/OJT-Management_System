/**
 * Calculates a user-friendly duration string between two dates.
 * E.g., "3 Months", "1 Month, 15 Days", "14 Days"
 */
export const getDurationString = (startDate: string, endDate: string): string => {
  if (!startDate || !endDate) return '';
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';
  
  const diffTime = end.getTime() - start.getTime();
  if (diffTime < 0) return 'Invalid dates';
  
  // Calculate difference in calendar years, months, and days
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();
  
  if (days < 0) {
    months -= 1;
    // Get total days in the month prior to the end date's month
    const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  
  const totalMonths = years * 12 + months;
  
  const parts = [];
  if (totalMonths > 0) {
    parts.push(`${totalMonths} ${totalMonths === 1 ? 'Month' : 'Months'}`);
  }
  if (days > 0) {
    parts.push(`${days} ${days === 1 ? 'Day' : 'Days'}`);
  }
  
  return parts.join(', ') || '0 Days';
};
