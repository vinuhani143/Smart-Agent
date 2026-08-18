/** True only when the feature flag is on and official Amazon credentials are configured. */
export function isAmazonMusicLive(
  providers: Array<{ id: string; enabled: boolean }> | undefined,
): boolean {
  return Boolean(providers?.some((item) => item.id === 'amazon_music' && item.enabled));
}

export function isAmazonMusicReady(
  providers: Array<{ id: string; enabled: boolean; connected?: boolean }> | undefined,
): boolean {
  return Boolean(providers?.some((item) => item.id === 'amazon_music' && item.enabled && item.connected));
}
