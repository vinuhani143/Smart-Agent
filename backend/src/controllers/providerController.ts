import type { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { listProviders } from '../providers/ProviderRegistry';
import { fromPrismaProvider } from '../providers/ProviderRegistry';

export async function getProviders(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  const accounts = userId
    ? await prisma.musicAccount.findMany({
        where: { userId },
        select: { provider: true, providerUserId: true, expiresAt: true },
      })
    : [];
  const connected = new Map(accounts.map((account) => [fromPrismaProvider(account.provider), account]));

  res.json({
    providers: listProviders().map((provider) => {
      const account = connected.get(provider.id);
      return {
        id: provider.id,
        name: provider.displayName,
        enabled: provider.isEnabled(),
        connected: Boolean(account),
        providerUserId: account?.providerUserId,
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
