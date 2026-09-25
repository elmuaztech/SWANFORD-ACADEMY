export const GALLERY_CATEGORIES = [
  'CAMPUS',
  'ACADEMICS',
  'ACTIVITIES',
  'FACILITIES',
  'TAHFEEZ',
] as const;

export type GalleryCategory = (typeof GALLERY_CATEGORIES)[number];

export interface PublicGalleryItem {
  id: string;
  title: string;
  caption: string | null;
  category: GalleryCategory;
  altText: string;
  displayOrder: number;
  publishedAt: string | null;
  mediaAssetId: string;
  mediaAsset: {
    id: string;
    mimeType: string;
    width: number | null;
    height: number | null;
    sizeBytes: number;
    url: string;
  };
}
