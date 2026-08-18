/** Remote album art only — never file:, data:, javascript:, or invalid URLs. */
export function isRemoteArtworkUrl(url: string | null | undefined): url is string {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
