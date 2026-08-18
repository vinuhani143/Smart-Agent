import { normalizeText } from '../../utils/normalize';

export type YouTubeParseStrategy =
  | 'artist-dash-song'
  | 'song-dash-artist'
  | 'pipe-separator'
  | 'quoted-title'
  | 'by-keyword'
  | 'colon-separator'
  | 'channel-fallback'
  | 'raw';

export interface ParsedYouTubeTitle {
  title: string;
  artist: string;
  originalTitle: string;
  channelTitle: string;
  confidence: number;
  strategy: YouTubeParseStrategy;
  parsedTitle?: string;
  parsedArtist?: string;
}

const DASH_SPLIT = /\s+[-–—]\s+/;
const PIPE_SPLIT = /\s+\|\s+/;
const BY_SPLIT = /\s+by\s+/i;
const COLON_SPLIT = /\s*:\s+/;

const PAREN_NOISE =
  /\s*[\(\[]\s*(official(?:\s+(?:music\s+)?(?:audio|video))?|lyrics?|lyric\s+video|audio|video|visualizer|hd|4k|remaster(?:ed)?|live|radio\s+edit|topic)[^)\]]*[\)\]]/gi;

const TRAILING_NOISE =
  /\s*[-–—|:]\s*(official(?:\s+(?:music\s+)?(?:audio|video))?|lyrics?|audio|video|hd|4k)\s*$/i;

export function stripYouTubeNoise(value: string): string {
  return value
    .replace(PAREN_NOISE, ' ')
    .replace(TRAILING_NOISE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function channelLooksLikeArtist(channelTitle: string, artist: string): boolean {
  const channel = normalizeText(channelTitle)
    .replace(/\bvevo\b/g, ' ')
    .replace(/\btopic\b/g, ' ')
    .replace(/\bofficial\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const name = normalizeText(artist);
  if (!channel || !name) {
    return false;
  }
  if (channel === name) {
    return true;
  }
  const compactChannel = channel.replace(/\s+/g, '');
  const compactName = name.replace(/\s+/g, '');
  return compactChannel === compactName || compactChannel.includes(compactName) || compactName.includes(compactChannel);
}

function looksLikePersonOrAct(value: string): boolean {
  const words = value.trim().split(/\s+/);
  return value.trim().length >= 2 && words.length <= 8 && value.length <= 80;
}

function result(
  originalTitle: string,
  channelTitle: string,
  title: string,
  artist: string,
  confidence: number,
  strategy: YouTubeParseStrategy,
  parsedTitle?: string,
  parsedArtist?: string,
): ParsedYouTubeTitle {
  const low = confidence < 80;
  return {
    originalTitle,
    channelTitle,
    title: low ? originalTitle : title,
    artist: low ? channelTitle || artist : artist,
    confidence,
    strategy,
    parsedTitle: parsedTitle ?? title,
    parsedArtist: parsedArtist ?? artist,
  };
}

/**
 * Infer song title + artist from a YouTube video title.
 * Never assumes the raw title is a song name without a parse strategy.
 */
export function parseYouTubeTitle(rawTitle: string, channelTitle: string): ParsedYouTubeTitle {
  const originalTitle = rawTitle.trim();
  const channel = channelTitle.trim();
  const cleaned = stripYouTubeNoise(originalTitle);

  const quoted = /^["“'](.+?)["”']/.exec(cleaned);
  if (quoted?.[1] && looksLikePersonOrAct(quoted[1])) {
    const remainder = cleaned.slice(quoted[0].length).replace(/^[\s\-–—|:]+/, '');
    const artist = remainder.length > 1 ? stripYouTubeNoise(remainder) : channel;
    const confidence = channelLooksLikeArtist(channel, artist) ? 90 : 82;
    return result(originalTitle, channel, quoted[1], artist || channel, confidence, 'quoted-title');
  }

  const dashParts = cleaned.split(DASH_SPLIT);
  if (dashParts.length >= 2) {
    const left = dashParts[0]?.trim() ?? '';
    const right = dashParts.slice(1).join(' - ').trim();
    if (looksLikePersonOrAct(left) && looksLikePersonOrAct(right)) {
      if (channelLooksLikeArtist(channel, left)) {
        return result(originalTitle, channel, right, left, 96, 'artist-dash-song');
      }
      if (channelLooksLikeArtist(channel, right)) {
        return result(originalTitle, channel, left, right, 94, 'song-dash-artist');
      }
      return result(originalTitle, channel, right, left, 76, 'artist-dash-song', right, left);
    }
  }

  const pipeParts = cleaned.split(PIPE_SPLIT);
  if (pipeParts.length === 2) {
    const left = pipeParts[0]?.trim() ?? '';
    const right = pipeParts[1]?.trim() ?? '';
    if (looksLikePersonOrAct(left) && looksLikePersonOrAct(right)) {
      if (channelLooksLikeArtist(channel, right)) {
        return result(originalTitle, channel, left, right, 93, 'pipe-separator');
      }
      if (channelLooksLikeArtist(channel, left)) {
        return result(originalTitle, channel, right, left, 88, 'pipe-separator');
      }
      return result(originalTitle, channel, left, right, 72, 'pipe-separator', left, right);
    }
  }

  const byParts = cleaned.split(BY_SPLIT);
  if (byParts.length === 2) {
    const song = byParts[0]?.trim() ?? '';
    const artist = byParts[1]?.trim() ?? '';
    if (looksLikePersonOrAct(song) && looksLikePersonOrAct(artist)) {
      const confidence = channelLooksLikeArtist(channel, artist) ? 92 : 80;
      return result(originalTitle, channel, song, artist, confidence, 'by-keyword');
    }
  }

  const colonParts = cleaned.split(COLON_SPLIT);
  if (colonParts.length === 2) {
    const left = colonParts[0]?.trim() ?? '';
    const right = colonParts[1]?.trim() ?? '';
    if (looksLikePersonOrAct(left) && looksLikePersonOrAct(right) && left.split(' ').length <= 4) {
      if (channelLooksLikeArtist(channel, left)) {
        return result(originalTitle, channel, right, left, 88, 'colon-separator');
      }
    }
  }

  if (channel) {
    return result(originalTitle, channel, cleaned || originalTitle, channel, 42, 'channel-fallback');
  }

  return result(originalTitle, channel, cleaned || originalTitle, 'Unknown artist', 20, 'raw');
}

export function parseIsoDurationMs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(value);
  if (!match) {
    return undefined;
  }
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}
