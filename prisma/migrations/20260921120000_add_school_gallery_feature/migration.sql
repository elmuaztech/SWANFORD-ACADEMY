-- AlterEnum
ALTER TYPE "MediaType" ADD VALUE IF NOT EXISTS 'GALLERY_PHOTO';

-- CreateTable
CREATE TABLE IF NOT EXISTS "gallery_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "media_asset_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "caption" TEXT,
    "alt_text" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'CAMPUS',
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gallery_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "gallery_items_is_published_display_order_idx" ON "gallery_items"("is_published", "display_order");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "gallery_items_category_idx" ON "gallery_items"("category");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'gallery_items_media_asset_id_fkey'
    ) THEN
        ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_media_asset_id_fkey" 
        FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'gallery_items_created_by_id_fkey'
    ) THEN
        ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_created_by_id_fkey" 
        FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
