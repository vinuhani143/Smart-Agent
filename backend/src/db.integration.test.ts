process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-value-32chars-min';
process.env.TOKEN_ENCRYPTION_KEY ??= 'ab'.repeat(32);

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { prisma } from './config/prisma';
import { createLocalPlaylist, deletePlaylist, getPlaylist, addTrackToPlaylist, updatePlaylist, removeTrackFromPlaylist, reorderPlaylistTracks } from './services/PlaylistService';
import { AppError, DuplicateTrackError, NotFoundError } from './types/errors';

const userIds: string[] = [];

after(async () => {
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.$disconnect();
});

async function newUser() {
  const user = await prisma.user.create({ data: { displayName: 'QA listener' } });
  userIds.push(user.id);
  return user;
}

describe('database constraints and playlist operations', () => {
  it('cascades playlists when a user is deleted', async () => {
    const user = await newUser();
    const playlist = await createLocalPlaylist(user.id, { name: 'Cascade me' });
    await prisma.user.delete({ where: { id: user.id } });
    const leftover = await prisma.playlist.findUnique({ where: { id: playlist.id } });
    assert.equal(leftover, null);
  });

  it('enforces one connected account per user and provider', async () => {
    const user = await newUser();
    await prisma.musicAccount.create({
      data: {
        userId: user.id,
        provider: 'SPOTIFY',
        providerUserId: 'spotify-user-1',
        accessToken: 'cipher.access.one',
      },
    });
    await assert.rejects(() =>
      prisma.musicAccount.create({
        data: {
          userId: user.id,
          provider: 'SPOTIFY',
          providerUserId: 'spotify-user-2',
          accessToken: 'cipher.access.two',
        },
      }),
    );
  });

  it('prevents duplicate tracks on a playlist and allows an empty playlist', async () => {
    const user = await newUser();
    const empty = await createLocalPlaylist(user.id, { name: 'Empty' });
    assert.equal(empty.tracks.length, 0);

    const track = {
      provider: 'spotify' as const,
      providerTrackId: 'spotify-track-1',
      title: 'Version of Me',
      artist: 'Test Artist',
      spotifyId: 'spotify-track-1',
      durationMs: 180000,
    };
    const withSong = await createLocalPlaylist(user.id, { name: 'With a song', tracks: [track] });
    assert.equal(withSong.tracks.length, 1);
    await assert.rejects(() => addTrackToPlaylist(user.id, withSong.id, track), DuplicateTrackError);
  });

  it('keeps the playlist when getPlaylist is scoped to the owner only', async () => {
    const owner = await newUser();
    const stranger = await newUser();
    const playlist = await createLocalPlaylist(owner.id, { name: 'Owned' });
    await assert.rejects(() => getPlaylist(stranger.id, playlist.id), NotFoundError);
    await deletePlaylist(owner.id, playlist.id);
    await assert.rejects(() => getPlaylist(owner.id, playlist.id), NotFoundError);
  });

  it('renames, edits description, removes a song, and keeps remaining tracks', async () => {
    const user = await newUser();
    const first = {
      provider: 'spotify' as const,
      providerTrackId: 'spotify-track-a',
      title: 'First',
      artist: 'Artist',
      spotifyId: 'spotify-track-a',
      durationMs: 120000,
    };
    const second = {
      provider: 'spotify' as const,
      providerTrackId: 'spotify-track-b',
      title: 'Second',
      artist: 'Artist',
      spotifyId: 'spotify-track-b',
      durationMs: 130000,
    };
    const created = await createLocalPlaylist(user.id, { name: 'Original', description: 'before', tracks: [first, second] });
    const renamed = await updatePlaylist(user.id, created.id, { name: 'Renamed mix', description: 'after' });
    assert.equal(renamed.name, 'Renamed mix');
    assert.equal(renamed.description, 'after');
    assert.equal(renamed.tracks.length, 2);
    const removedTrackId = renamed.tracks[0]!.trackId;
    const afterRemove = await removeTrackFromPlaylist(user.id, created.id, removedTrackId);
    assert.equal(afterRemove.tracks.length, 1);
    assert.equal(afterRemove.tracks[0]!.position, 0);
  });

  it('rolls back playlist creation if track membership cannot be written', async () => {
    const user = await newUser();
    const track = await prisma.track.create({
      data: {
        title: 'Shared',
        artist: 'Artist',
        spotifyId: `spotify-unique-${user.id}`,
      },
    });
    await assert.rejects(() =>
      prisma.$transaction(async (tx) => {
        const playlist = await tx.playlist.create({
          data: { userId: user.id, name: 'Partial' },
        });
        await tx.playlistTrack.create({
          data: { playlistId: playlist.id, trackId: track.id, position: 0 },
        });
        await tx.playlistTrack.create({
          data: { playlistId: playlist.id, trackId: track.id, position: 1 },
        });
      }),
    );
    const leftover = await prisma.playlist.findFirst({ where: { userId: user.id, name: 'Partial' } });
    assert.equal(leftover, null);
  });

  it('reorders saved playlist tracks in a transaction', async () => {
    const user = await newUser();
    const created = await createLocalPlaylist(user.id, {
      name: 'Reorder me',
      tracks: [
        { provider: 'spotify', providerTrackId: 'r1', title: 'One', artist: 'A', spotifyId: 'r1' },
        { provider: 'spotify', providerTrackId: 'r2', title: 'Two', artist: 'A', spotifyId: 'r2' },
        { provider: 'spotify', providerTrackId: 'r3', title: 'Three', artist: 'A', spotifyId: 'r3' },
      ],
    });
    const original = created.tracks.map((item) => item.trackId);
    const reversed = [...original].reverse();
    const reordered = await reorderPlaylistTracks(user.id, created.id, reversed);
    assert.deepEqual(reordered.tracks.map((item) => item.trackId), reversed);
    await assert.rejects(
      () => reorderPlaylistTracks(user.id, created.id, [original[0]!, original[0]!, original[1]!]),
      (error: unknown) => error instanceof AppError && error.statusCode === 400,
    );
    await assert.rejects(
      () => reorderPlaylistTracks(user.id, created.id, [original[0]!]),
      (error: unknown) => error instanceof AppError && error.statusCode === 400,
    );
    await assert.rejects(
      () => reorderPlaylistTracks(user.id, created.id, [...original.slice(0, 2), 'not-in-playlist']),
      (error: unknown) => error instanceof AppError && error.statusCode === 400,
    );
    const stranger = await newUser();
    await assert.rejects(() => reorderPlaylistTracks(stranger.id, created.id, reversed), NotFoundError);
  });
});
