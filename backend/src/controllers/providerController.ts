import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { getProvider, fromPrismaProvider, listProviders, parseProviderId } from '../providers/ProviderRegistry';
import {
  AMAZON_MUSIC_DOCS_URL,
  amazonUnavailableMessage,
  buildAmazonFeatureStatus,
  credentialsConfigured,
  resolveAmazonAccessStatus,
} from '../providers/amazon/amazonConfig';
import { getAmazonRuntimeConfig } from '../providers/amazon/amazonRuntime';
import { toPublicAccount, withProviderTokens } from '../services/TokenService';

export async function getProviders(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  const accounts = userId
    ? await prisma.musicAccount.findMany({
        where: { userId },
      })
    : [];
  const connected = new Map(accounts.map((account) => [fromPrismaProvider(account.provider), toPublicAccount(account)]));
  const amazonConfig = getAmazonRuntimeConfig();
  const amazonConfigured = credentialsConfigured(amazonConfig);

  res.json({
    providers: listProviders().map((provider) => {
      const account = connected.get(provider.id);
      const amazonStatus =
        provider.id === 'amazon_music'
          ? resolveAmazonAccessStatus({
              featureEnabled: amazonConfig.featureEnabled,
              credentialsConfigured: amazonConfigured,
              authenticated: Boolean(account),
            })
          : undefined;
      const enabled = provider.isEnabled();
      return {
        id: provider.id,
        name: provider.displayName,
        enabled,
        connected: Boolean(account),
        providerUserId: account?.providerUserId,
        displayName: account?.displayName ?? null,
        imageUrl: account?.imageUrl ?? null,
        expiresAt: account?.expiresAt ?? null,
        subscriptionTier: provider.id === 'amazon_music' ? accounts.find((item) => item.provider === 'AMAZON_MUSIC')?.subscriptionTier ?? null : undefined,
        accessStatus: amazonStatus,
        learnMoreUrl: provider.id === 'amazon_music' ? AMAZON_MUSIC_DOCS_URL : null,
        unavailableReason: enabled
          ? null
          : provider.id === 'amazon_music'
            ? amazonUnavailableMessage(amazonStatus ?? 'closed_beta')
            : `${provider.displayName} credentials are not configured on the server.`,
      };
    }),
  });
}

export async function getProviderFeatureStatus(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  const amazonAccount = userId
    ? await prisma.musicAccount.findUnique({
        where: { userId_provider: { userId, provider: 'AMAZON_MUSIC' } },
        select: { id: true },
      })
    : null;
  const amazonConfig = getAmazonRuntimeConfig();
  const amazonConfigured = credentialsConfigured(amazonConfig);
  const amazonMusic = buildAmazonFeatureStatus({
    featureEnabled: amazonConfig.featureEnabled,
    credentialsConfigured: amazonConfigured,
    authenticated: Boolean(amazonAccount),
  });

  res.json({
    spotify: {
      enabled: getProvider('spotify').isEnabled(),
      configured: getProvider('spotify').isEnabled(),
    },
    youtube: {
      enabled: getProvider('youtube').isEnabled(),
      configured: getProvider('youtube').isEnabled(),
    },
    amazonMusic: {
      ...amazonMusic,
      learnMoreUrl: AMAZON_MUSIC_DOCS_URL,
    },
  });
}

export const updateRemotePlaylistSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(5000).optional(),
});

export async function listRemotePlaylists(req: Request, res: Response): Promise<void> {
  const provider = parseProviderId(String(req.params.provider));
  const playlists = await withProviderTokens(req.userId!, provider, (tokens) =>
    getProvider(provider).getUserPlaylists(tokens),
  );
  res.json({ playlists });
}

export async function getRemotePlaylist(req: Request, res: Response): Promise<void> {
  const provider = parseProviderId(String(req.params.provider));
  const playlist = await withProviderTokens(req.userId!, provider, (tokens) =>
    getProvider(provider).getPlaylist(tokens, String(req.params.playlistId)),
  );
  res.json({ playlist });
}

export async function updateRemotePlaylist(req: Request, res: Response): Promise<void> {
  const provider = parseProviderId(String(req.params.provider));
  const body = updateRemotePlaylistSchema.parse(req.body);
  const playlist = await withProviderTokens(req.userId!, provider, (tokens) =>
    getProvider(provider).updatePlaylist(tokens, String(req.params.playlistId), body),
  );
  res.json({ playlist });
}

export async function deleteRemotePlaylist(req: Request, res: Response): Promise<void> {
  const provider = parseProviderId(String(req.params.provider));
  await withProviderTokens(req.userId!, provider, (tokens) =>
    getProvider(provider).deletePlaylist(tokens, String(req.params.playlistId)),
  );
  res.status(204).send();
}
