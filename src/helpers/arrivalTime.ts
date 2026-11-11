export const formatArrivalMinutes = (minutes?: number | null) => {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return "";
  const value = Math.round(minutes);
  if (value < 60) return `${value} minutes`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (rest === 0) return hours === 1 ? "1 hour" : `${hours} hours`;
  return `${hours}h ${rest}m`;
};
