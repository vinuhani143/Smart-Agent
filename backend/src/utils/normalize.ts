const PUNCTUATION = /[^\p{L}\p{N}\s]/gu;

const NOISE_PHRASES = [
  'official audio',
  'official video',
  'official music video',
  'lyrics',
  'lyric video',
  'visualizer',
  'audio',
  'hd',
  '4k',
  'remastered',
  'remaster',
  'live',
  'remix',
  'radio edit',
  'bonus track',
];

const FEATURE_PATTERN = /\b(feat\.?|ft\.?|featuring)\b.*$/i;

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

export function stripNoisePhrases(value: string): { text: string; strippedRemixOrLive: boolean } {
  let text = ` ${value} `;
  let strippedRemixOrLive = false;
  for (const phrase of NOISE_PHRASES) {
    const pattern = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (pattern.test(text) && (phrase === 'live' || phrase === 'remix' || phrase === 'radio edit')) {
      strippedRemixOrLive = true;
    }
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
