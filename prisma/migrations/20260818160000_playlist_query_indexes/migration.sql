-- Performance indexes for playlist library queries.

CREATE INDEX IF NOT EXISTS "Playlist_userId_updatedAt_idx" ON "Playlist"("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "Playlist_sourcePlaylistId_idx" ON "Playlist"("sourcePlaylistId");
