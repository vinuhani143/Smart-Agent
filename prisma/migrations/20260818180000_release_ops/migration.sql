-- Release operations: anonymous recovery, compensating remote playlist records, idempotency.

CREATE TYPE "AccountKind" AS ENUM ('ANONYMOUS');
CREATE TYPE "RemoteOperationStatus" AS ENUM ('PENDING', 'REMOTE_CREATED', 'COMPLETE', 'FAILED', 'ROLLED_BACK', 'REMOTE_CLEANUP_REQUIRED');

ALTER TABLE "User" ADD COLUMN "accountKind" "AccountKind" NOT NULL DEFAULT 'ANONYMOUS';
ALTER TABLE "User" ADD COLUMN "recoveryCodeHash" TEXT;
ALTER TABLE "User" ADD COLUMN "recoveryCodeIssuedAt" TIMESTAMP(3);

CREATE TABLE "RemotePlaylistOperation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "MusicProviderName" NOT NULL,
    "purpose" TEXT NOT NULL,
    "localPlaylistId" TEXT,
    "remotePlaylistId" TEXT,
    "status" "RemoteOperationStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RemotePlaylistOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RemotePlaylistOperation_status_updatedAt_idx" ON "RemotePlaylistOperation"("status", "updatedAt");
CREATE INDEX "RemotePlaylistOperation_userId_createdAt_idx" ON "RemotePlaylistOperation"("userId", "createdAt");
CREATE UNIQUE INDEX "User_recoveryCodeHash_key" ON "User"("recoveryCodeHash");
CREATE UNIQUE INDEX "IdempotencyRecord_userId_key_key" ON "IdempotencyRecord"("userId", "key");
CREATE INDEX "IdempotencyRecord_createdAt_idx" ON "IdempotencyRecord"("createdAt");

ALTER TABLE "RemotePlaylistOperation" ADD CONSTRAINT "RemotePlaylistOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
