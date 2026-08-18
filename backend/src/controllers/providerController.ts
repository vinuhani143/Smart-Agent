import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { getProvider, fromPrismaProvider, listProviders, parseProviderId } from '../providers/ProviderRegistry';
import { toPublicAccount, withProviderTokens } from '../services/TokenService';

export async function getProviders(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  const accounts = userId
    ? await prisma.musicAccount.findMany({
        where: { userId },
      })
    : [];
  const connected = new Map(accounts.map((account) => [fromPrismaProvider(account.provider), toPublicAccount(account)]));

  res.json({
    providers: listProviders().map((provider) => {
      const account = connected.get(provider.id);
      return {
        id: provider.id,
        name: provider.displayName,
        enabled: provider.isEnabled(),
        connected: Boolean(account),
        providerUserId: account?.providerUserId,
        displayName: account?.displayName ?? null,
        imageUrl: account?.imageUrl ?? null,
        expiresAt: account?.expiresAt ?? null,
        unavailableReason: provider.isEnabled()
          ? null
          : provider.id === 'amazon_music'
            ? 'Amazon Music is a placeholder until official API access is available.'
            : `${provider.displayName} credentials are not configured on the server.`,
      };
    }),
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
