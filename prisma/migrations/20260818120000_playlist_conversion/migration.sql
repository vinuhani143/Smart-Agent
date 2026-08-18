-- CreateEnum
CREATE TYPE "ConversionStatus" AS ENUM ('ANALYZED', 'CONFIRMED', 'CREATED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "ConversionTrackStatus" AS ENUM ('MATCHED', 'NEEDS_REVIEW', 'NOT_FOUND', 'ACCEPTED', 'SKIPPED', 'MANUAL', 'DUPLICATE');

-- CreateTable
CREATE TABLE "PlaylistConversion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceProvider" "MusicProviderName" NOT NULL,
    "sourcePlaylistId" TEXT NOT NULL,
    "sourcePlaylistName" TEXT,
    "sourcePlaylistDescription" TEXT,
    "destinationProvider" "MusicProviderName" NOT NULL,
    "destinationPlaylistId" TEXT,
    "localPlaylistId" TEXT,
    "status" "ConversionStatus" NOT NULL DEFAULT 'ANALYZED',
    "totalTracks" INTEGER NOT NULL DEFAULT 0,
    "matchedTracks" INTEGER NOT NULL DEFAULT 0,
    "reviewTracks" INTEGER NOT NULL DEFAULT 0,
    "notFoundTracks" INTEGER NOT NULL DEFAULT 0,
    "duplicateTracks" INTEGER NOT NULL DEFAULT 0,
    "addedTracks" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaylistConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionTrack" (
    "id" TEXT NOT NULL,
    "conversionId" TEXT NOT NULL,
    "sourceTrackId" TEXT NOT NULL,
    "destinationTrackId" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "matchMethod" TEXT,
    "status" "ConversionTrackStatus" NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,
    "destinationSnapshot" JSONB,
    "alternativesSnapshot" JSONB,
    "addedToDestination" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ConversionTrack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlaylistConversion_userId_createdAt_idx" ON "PlaylistConversion"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversionTrack_conversionId_position_idx" ON "ConversionTrack"("conversionId", "position");

-- AddForeignKey
ALTER TABLE "PlaylistConversion" ADD CONSTRAINT "PlaylistConversion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversionTrack" ADD CONSTRAINT "ConversionTrack_conversionId_fkey" FOREIGN KEY ("conversionId") REFERENCES "PlaylistConversion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
