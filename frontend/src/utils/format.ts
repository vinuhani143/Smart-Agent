export function formatDuration(durationMs: number | null | undefined): string {
  if (durationMs === undefined || durationMs === null || durationMs < 0) {
    return '--:--';
  }
  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatTrackCount(count: number): string {
  return count === 1 ? '1 song' : `${count} songs`;
}
