import { getEnv } from '../config/env';
import { AiUnavailableError } from '../types/errors';
import type { AIProvider, PlaylistIntent, ScoredTrack } from './types';
import {
  applyIntentHints,
  extractLiteralIntent,
  intentFromUnknown,
  isUnsafePlaylistPrompt,
  mergeGroundedIntent,
} from './intentParser';
import { AppError, ErrorCode } from '../types/errors';
import { userSafeAiMessage } from './generationRules';

const PARSE_SYSTEM = `You extract playlist search criteria from a user's request.
Return JSON only. All fields optional. Do not invent years, artists, languages, or genres that are not clearly present in the request.
Do not recommend illegal content. Do not produce copyrighted lyrics or audio.
Schema:
{
  "language": string,
  "genre": string,
  "mood": string,
  "theme": string,
  "artist": string,
  "yearFrom": number,
  "yearTo": number,
  "durationMinutes": number,
  "maxTracks": number,
  "allowDuplicates": boolean,
  "explicitContent": boolean,
  "energyLevel": "low"|"medium"|"high",
  "tempo": "slow"|"medium"|"fast",
          "sourceProvider": "spotify"|"youtube"|"amazon_music"|"both",
          "destinationProvider": "spotify"|"youtube"|"amazon_music"
}`;

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface OpenAiCompatibleChoice {
  message?: { content?: string };
}

interface OpenAiCompatibleResponse {
  choices?: OpenAiCompatibleChoice[];
  error?: { message?: string };
}

interface AnthropicResponse {
  content?: Array<{ text?: string }>;
  error?: { message?: string };
}

export function requireAiConfig(): { apiKey: string; model: string; baseUrl: string; provider: string } {
  const env = getEnv();
  const apiKey = env.AI_API_KEY.trim();
  const model = env.AI_MODEL.trim();
  const provider = env.AI_PROVIDER.trim().toLowerCase();
  if (!apiKey || !model || !provider) {
    throw new AiUnavailableError(
      'AI playlist generation is not configured. Set AI_PROVIDER, AI_API_KEY, and AI_MODEL on the backend.',
    );
  }
  let baseUrl = env.AI_BASE_URL.trim();
  if (!baseUrl) {
    if (provider === 'openai') {
      baseUrl = 'https://api.openai.com/v1';
    } else if (provider === 'anthropic') {
      baseUrl = 'https://api.anthropic.com/v1';
    } else if (provider === 'openai-compatible') {
      throw new AiUnavailableError(
        'AI_BASE_URL is required when AI_PROVIDER is openai-compatible.',
      );
    } else {
      throw new AiUnavailableError(
        `Unsupported AI_PROVIDER "${env.AI_PROVIDER}". Use openai, anthropic, or openai-compatible.`,
      );
    }
  }
  return { apiKey, model, baseUrl, provider };
}

function extractJsonObject(text: string): Record<string, unknown> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AiUnavailableError('Could not reach the AI provider. Check the network and AI_BASE_URL.');
  }

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 429) {
      throw new AiUnavailableError(userSafeAiMessage(429));
    }
    throw new AiUnavailableError(userSafeAiMessage(response.status));
  }
  return json;
}

async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const { apiKey, model, baseUrl, provider } = requireAiConfig();

  if (provider === 'anthropic' && !getEnv().AI_BASE_URL.trim()) {
    const json = (await postJson(
      `${baseUrl.replace(/\/$/, '')}/messages`,
      {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      {
        model,
        max_tokens: 800,
        system: messages.find((message) => message.role === 'system')?.content,
        messages: messages
          .filter((message) => message.role === 'user')
          .map((message) => ({ role: 'user', content: message.content })),
      },
    )) as AnthropicResponse;
    return json.content?.[0]?.text ?? '';
  }

  const json = (await postJson(
    `${baseUrl.replace(/\/$/, '')}/chat/completions`,
    { Authorization: `Bearer ${apiKey}` },
    { model, messages, temperature: 0.2 },
  )) as OpenAiCompatibleResponse;

  return json.choices?.[0]?.message?.content ?? '';
}

export class ConfigurableLlmProvider implements AIProvider {
  async parsePlaylistRequest(prompt: string, hints?: Partial<PlaylistIntent>): Promise<PlaylistIntent> {
    if (isUnsafePlaylistPrompt(prompt)) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'This request cannot be fulfilled. MusicMix does not download or recommend illegal content.',
        400,
      );
    }
    const literal = extractLiteralIntent(prompt);
    const content = await chatCompletion([
      { role: 'system', content: PARSE_SYSTEM },
      { role: 'user', content: prompt },
    ]);
    const proposed = intentFromUnknown(extractJsonObject(content));
    return applyIntentHints(mergeGroundedIntent(prompt, literal, proposed), hints);
  }

  async rankTracks(tracks: ScoredTrack[], intent: PlaylistIntent): Promise<ScoredTrack[]> {
    if (tracks.length === 0) {
      return [];
    }
    try {
      const payload = tracks.slice(0, 40).map((item) => ({
        id: `${item.track.provider}:${item.track.providerTrackId}`,
        title: item.track.title,
        artist: item.track.artist,
        score: item.trackScore,
      }));
      const content = await chatCompletion([
        {
          role: 'system',
          content:
            'Return JSON {"order":["provider:id",...]} ranking tracks for the playlist intent. Use only the given ids. Do not invent tracks. Do not claim a perfect match.',
        },
        {
          role: 'user',
          content: JSON.stringify({ intent, tracks: payload }),
        },
      ]);
      const parsed = extractJsonObject(content);
      const order = Array.isArray(parsed.order)
        ? parsed.order.filter((id): id is string => typeof id === 'string')
        : [];
      if (order.length === 0) {
        return tracks;
      }
      const byId = new Map<string, ScoredTrack>(
        tracks.map((item) => [`${item.track.provider}:${item.track.providerTrackId}`, item]),
      );
      const ranked: ScoredTrack[] = [];
      for (const id of order) {
        const item = byId.get(id);
        if (item) {
          ranked.push(item);
          byId.delete(id);
        }
      }
      byId.forEach((item) => {
        ranked.push(item);
      });
      return ranked;
    } catch {
      return tracks;
    }
  }

  async generatePlaylistDescription(
    intent: PlaylistIntent,
    tracks: ScoredTrack[],
  ): Promise<{ title: string; description: string }> {
    const fallbackTitle = [
      intent.yearFrom && intent.yearTo ? `${intent.yearFrom}–${intent.yearTo}` : '',
      intent.language ?? '',
      intent.mood ?? intent.genre ?? 'Mixed',
      'Playlist',
    ]
      .filter(Boolean)
      .join(' ');
    const fallbackDescription = `Generated from your request. ${tracks.length} tracks. Criteria only — no audio was generated.`;
    try {
      const content = await chatCompletion([
        {
          role: 'system',
          content:
            'Return JSON {"title":"","description":""} for a playlist. Do not include copyrighted lyrics. Keep description under 280 characters.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            intent,
            sample: tracks.slice(0, 12).map((item) => `${item.track.title} — ${item.track.artist}`),
          }),
        },
      ]);
      const parsed = extractJsonObject(content);
      const title =
        typeof parsed.title === 'string' && parsed.title.trim()
          ? parsed.title.trim().slice(0, 80)
          : fallbackTitle || 'Generated playlist';
      const description =
        typeof parsed.description === 'string' && parsed.description.trim()
          ? parsed.description.trim().slice(0, 280)
          : fallbackDescription;
      return { title, description };
    } catch {
      return {
        title: fallbackTitle || 'Generated playlist',
        description: fallbackDescription,
      };
    }
  }
}

export function getAIProvider(): AIProvider {
  requireAiConfig();
  return new ConfigurableLlmProvider();
}
