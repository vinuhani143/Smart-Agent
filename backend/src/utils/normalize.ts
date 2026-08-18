const PUNCTUATION = /[^\p{L}\p{N}\s]/gu;

/**
 * Marketing/wrapper phrases stripped from titles for matching.
 * Applied in parentheses/brackets and as trailing suffixes so meaningful
 * title words such as "Version of Me" or "Alive" are preserved.
 */
const NOISE_PHRASES = [
  'official music video',
  'official audio',
  'official video',
  'lyric video',
  'lyrics',
  'lyric',
  'visualizer',
  'remastered',
  'remaster',
  'radio edit',
  'extended mix',
  'bonus track',
  'official',
  'audio',
  'video',
  'hd',
  '4k',
];

const FEATURE_PATTERN = /\b(feat\.?|ft\.?|featuring)\b.*$/i;

const PAREN_NOISE =
  /\s*[\(\[{]\s*(official(?:\s+(?:music\s+)?(?:audio|video))?|lyrics?|lyric\s+video|audio|video|visualizer|hd|4k|remaster(?:ed)?|live|acoustic|radio\s+edit|extended\s+mix|version)[^)\]}]*[\)\]}]/gi;

const TRAILING_NOISE =
  /\s*[-–—|:]\s*(official(?:\s+(?:music\s+)?(?:audio|video))?|lyrics?|lyric\s+video|audio|video|hd|4k|remaster(?:ed)?|live|acoustic|radio\s+edit|extended\s+mix|version).*$/i;

const VARIANT_WORDS = new Set(['live', 'remix', 'acoustic', 'version']);

export interface NormalizedTrack {
  title: string;
  artist: string;
  album: string;
  rawTitle: string;
  rawArtist: string;
  strippedRemixOrLive: boolean;
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeText(value: string): string {
  const lowered = value.toLocaleLowerCase();
  const withoutPunctuation = lowered.replace(PUNCTUATION, ' ');
  return collapseSpaces(withoutPunctuation);
}

export function stripFeatureCredits(value: string): string {
  return collapseSpaces(value.replace(FEATURE_PATTERN, ''));
}

export function stripBracketAndTrailingNoise(value: string): { text: string; strippedRemixOrLive: boolean } {
  const before = value;
  const strippedVariant = /[\(\[{][^)\]}]*\b(live|remix|acoustic|version)\b[^)\]}]*[\)\]}]/i.test(value)
    || /[-–—|:]\s*(live|remix|acoustic|version)\b/i.test(value);
  const text = collapseSpaces(value.replace(PAREN_NOISE, ' ').replace(TRAILING_NOISE, ''));
  return {
    text: text.length > 0 ? text : before,
    strippedRemixOrLive: strippedVariant,
  };
}

export function stripNoisePhrases(value: string): { text: string; strippedRemixOrLive: boolean } {
  const bracketed = stripBracketAndTrailingNoise(value);
  let text = ` ${bracketed.text} `;
  let strippedRemixOrLive = bracketed.strippedRemixOrLive;
  for (const phrase of NOISE_PHRASES) {
    const pattern = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    text = text.replace(pattern, ' ');
  }
  return { text: collapseSpaces(text), strippedRemixOrLive };
}

export function normalizeTrackIdentity(title: string, artist: string, album?: string): NormalizedTrack {
  const titleWithoutFeatures = stripFeatureCredits(title);
  const stripped = stripNoisePhrases(titleWithoutFeatures);
  return {
    title: normalizeText(stripped.text),
    artist: normalizeText(stripFeatureCredits(artist)),
    album: normalizeText(album ?? ''),
    rawTitle: title,
    rawArtist: artist,
    strippedRemixOrLive: stripped.strippedRemixOrLive,
  };
}

export function durationLabel(durationMs: number | undefined): string {
  if (durationMs === undefined || durationMs < 0) {
    return '--:--';
  }
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function isVariantWord(word: string): boolean {
  return VARIANT_WORDS.has(word.toLocaleLowerCase());
}
