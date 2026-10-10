CREATE TYPE "AuctionApproverKind" AS ENUM ('SPECIAL_INSPECTOR', 'AUCTION_COMMITTEE', 'COMMERCIAL_MANAGER');

CREATE TABLE "case_auctions" (
    "requestId" TEXT NOT NULL,
    "startsAt" DATE NOT NULL,
    "endsAt" DATE NOT NULL,
    "discountMin" DECIMAL(5,2) NOT NULL,
    "discountMax" DECIMAL(5,2) NOT NULL,
    CONSTRAINT "case_auctions_pkey" PRIMARY KEY ("requestId")
);

CREATE TABLE "case_auction_items" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(18,0) NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "case_auction_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "case_auction_approvals" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" "AuctionApproverKind" NOT NULL,
    "status" "CaseInquiryStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "case_auction_approvals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "case_auctions_startsAt_idx" ON "case_auctions"("startsAt");
CREATE INDEX "case_auctions_endsAt_idx" ON "case_auctions"("endsAt");
CREATE INDEX "case_auction_items_requestId_idx" ON "case_auction_items"("requestId");
CREATE INDEX "case_auction_items_sortOrder_idx" ON "case_auction_items"("sortOrder");
CREATE UNIQUE INDEX "case_auction_approvals_requestId_kind_key" ON "case_auction_approvals"("requestId", "kind");
CREATE INDEX "case_auction_approvals_requestId_idx" ON "case_auction_approvals"("requestId");
CREATE INDEX "case_auction_approvals_kind_idx" ON "case_auction_approvals"("kind");
CREATE INDEX "case_auction_approvals_status_idx" ON "case_auction_approvals"("status");
CREATE INDEX "case_auction_approvals_decidedById_idx" ON "case_auction_approvals"("decidedById");

ALTER TABLE "case_auctions" ADD CONSTRAINT "case_auctions_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "case_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_auction_items" ADD CONSTRAINT "case_auction_items_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "case_auctions"("requestId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_auction_approvals" ADD CONSTRAINT "case_auction_approvals_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "case_auctions"("requestId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "case_auction_approvals" ADD CONSTRAINT "case_auction_approvals_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
