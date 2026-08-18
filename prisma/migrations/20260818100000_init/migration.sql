-- CreateEnum
CREATE TYPE "MusicProviderName" AS ENUM ('SPOTIFY', 'YOUTUBE', 'AMAZON_MUSIC');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('PENDING', 'GENERATED', 'CONFIRMED', 'CREATED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusicAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "MusicProviderName" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT,
    "durationMs" INTEGER,
    "releaseDate" TIMESTAMP(3),
    "isrc" TEXT,
    "spotifyId" TEXT,
    "youtubeVideoId" TEXT,
    "amazonMusicId" TEXT,
    "thumbnailUrl" TEXT,
    "language" TEXT,
    "genre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "sourceProvider" "MusicProviderName",
    "sourcePlaylistId" TEXT,
    "language" TEXT,
    "genre" TEXT,
    "mood" TEXT,
    "yearFrom" INTEGER,
    "yearTo" INTEGER,
    "targetDurationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistTrack" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaylistTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistGenerationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prompt" TEXT,
    "language" TEXT,
    "mood" TEXT,
    "genre" TEXT,
    "yearFrom" INTEGER,
    "yearTo" INTEGER,
    "durationMinutes" INTEGER,
    "allowDuplicates" BOOLEAN NOT NULL DEFAULT false,
    "targetProvider" "MusicProviderName",
    "status" "GenerationStatus" NOT NULL DEFAULT 'PENDING',
    "resultPlaylistId" TEXT,
    "candidateTracks" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaylistGenerationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "MusicProviderName" NOT NULL,
    "state" TEXT NOT NULL,
    "codeVerifier" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "MusicAccount_userId_idx" ON "MusicAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MusicAccount_userId_provider_key" ON "MusicAccount"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "MusicAccount_provider_providerUserId_key" ON "MusicAccount"("provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Track_spotifyId_key" ON "Track"("spotifyId");

-- CreateIndex
CREATE UNIQUE INDEX "Track_youtubeVideoId_key" ON "Track"("youtubeVideoId");

-- CreateIndex
CREATE UNIQUE INDEX "Track_amazonMusicId_key" ON "Track"("amazonMusicId");

-- CreateIndex
CREATE INDEX "Track_isrc_idx" ON "Track"("isrc");

-- CreateIndex
CREATE INDEX "Track_title_artist_idx" ON "Track"("title", "artist");

-- CreateIndex
CREATE INDEX "Playlist_userId_idx" ON "Playlist"("userId");

-- CreateIndex
CREATE INDEX "PlaylistTrack_trackId_idx" ON "PlaylistTrack"("trackId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistTrack_playlistId_trackId_key" ON "PlaylistTrack"("playlistId", "trackId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistTrack_playlistId_position_key" ON "PlaylistTrack"("playlistId", "position");

-- CreateIndex
CREATE INDEX "PlaylistGenerationRequest_userId_createdAt_idx" ON "PlaylistGenerationRequest"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthState_state_key" ON "OAuthState"("state");

-- CreateIndex
CREATE INDEX "OAuthState_expiresAt_idx" ON "OAuthState"("expiresAt");

-- AddForeignKey
ALTER TABLE "MusicAccount" ADD CONSTRAINT "MusicAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistTrack" ADD CONSTRAINT "PlaylistTrack_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistTrack" ADD CONSTRAINT "PlaylistTrack_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistGenerationRequest" ADD CONSTRAINT "PlaylistGenerationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthState" ADD CONSTRAINT "OAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

