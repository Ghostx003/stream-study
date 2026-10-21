/**
 * Formats seconds into HH:MM:SS or MM:SS
 */
export function formatTime(timeInSeconds, withHours = true) {
  const time = Math.max(0, Math.round(timeInSeconds || 0));
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = Math.floor(time % 60);

  if (hours > 0 && withHours) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Formats seconds into human-readable duration, e.g. "2h 45m" or "35m"
 */
export function formatDuration(seconds) {
  if (isNaN(seconds) || seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Formats total duration into clean string, e.g. "8h" or "45m"
 */
export function formatTotalDuration(seconds) {
  if (isNaN(seconds) || seconds <= 0) return '0h';
  const totalMinutes = Math.floor(seconds / 60);
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes >= 40) {
    hours += 1;
  }
  return hours > 0 ? `${hours}h` : `${minutes}m`;
}

/**
 * Calculates remaining time for display, formatted as "-MM:SS" or "-HH:MM:SS"
 */
export function formatTimeRemaining(remainingSeconds) {
  const formatted = formatTime(remainingSeconds);
  return `-${formatted}`;
}

/**
 * Natural sort comparator for alphanumeric strings (Lecture 2 before Lecture 10)
 */
export function naturalCompare(a, b) {
  const nameA = typeof a === 'string' ? a : (a?.name || a?.fileName || '');
  const nameB = typeof b === 'string' ? b : (b?.name || b?.fileName || '');
  return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
}
