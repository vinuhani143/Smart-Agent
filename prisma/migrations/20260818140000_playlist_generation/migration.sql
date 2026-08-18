-- AlterEnum
ALTER TYPE "GenerationStatus" ADD VALUE 'EDITED';

-- CreateTable
CREATE TABLE "PlaylistGeneration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestText" TEXT NOT NULL,
    "parsedIntent" JSONB NOT NULL,
    "generatedTitle" TEXT,
    "generatedDescription" TEXT,
    "provider" TEXT,
    "destinationProvider" "MusicProviderName",
    "trackCount" INTEGER NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER,
    "totalDurationMs" INTEGER NOT NULL DEFAULT 0,
    "status" "GenerationStatus" NOT NULL DEFAULT 'GENERATED',
    "candidateTracks" JSONB NOT NULL,
    "searchQueries" JSONB,
    "orderingStrategy" TEXT,
    "warning" TEXT,
    "resultPlaylistId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaylistGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlaylistGeneration_userId_createdAt_idx" ON "PlaylistGeneration"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlaylistGeneration" ADD CONSTRAINT "PlaylistGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
