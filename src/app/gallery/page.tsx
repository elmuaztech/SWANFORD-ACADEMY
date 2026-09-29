'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar, PublicFooter, Badge, EmptyState, LoadingState, ErrorState, Button, Modal } from '@/components';

interface GalleryPhoto {
  id: string;
  title: string;
  caption: string | null;
  altText: string;
  category: string;
  displayOrder: number;
  publishedAt: string | null;
  createdAt: string;
  imageUrl: string;
  width: number;
  height: number;
}

const CATEGORIES = [
  { label: 'All Photographs', value: 'ALL' },
  { label: 'Campus & Facilities', value: 'CAMPUS' },
  { label: 'Academic Life', value: 'ACADEMICS' },
  { label: 'Student Activities', value: 'ACTIVITIES' },
  { label: 'School Facilities', value: 'FACILITIES' },
  { label: 'Tahfeez & Quran', value: 'TAHFEEZ' },
];

export default function PublicGalleryPage() {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState<GalleryPhoto | null>(null);

  useEffect(() => {
    async function loadGallery() {
      try {
        setLoading(true);
        setError(null);
        const url = selectedCategory === 'ALL'
          ? '/api/public/gallery'
          : `/api/public/gallery?category=${encodeURIComponent(selectedCategory)}`;

        const res = await fetch(url);
        if (!res.ok) {
          throw new Error('Unable to load school gallery at this time.');
        }
        const data = await res.json();
        setPhotos(data.items || []);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error loading gallery.';
        setError(msg);
      } finally {
        setLoading(false);
      }
    }

    loadGallery();
  }, [selectedCategory]);

  return (
    <div className="min-h-screen flex flex-col bg-[#FFFFFF] text-[#1C1A1A] w-full max-w-full overflow-x-hidden">
      <Navbar currentPath="/gallery" />

      <main className="flex-1 w-full max-w-full overflow-x-hidden">
        {/* Page Banner */}
        <section className="bg-[#FAF7F2] border-b border-[#EADBDA] py-12 sm:py-16 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-3" data-reveal="fade-in">
            <div className="inline-block px-3 py-1 bg-[#EADBDA] text-[#5B0612] rounded-full text-xs font-bold uppercase tracking-wider">
              Life at Swanford Academy
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-[#5B0612]">
              School Gallery
            </h1>
            <p className="text-sm sm:text-base text-stone-600 max-w-2xl mx-auto leading-relaxed">
              Explore authentic glimpses into campus life, academic learning, Quranic memorization, and co-curricular milestones at Swanford Academy in Dutse.
            </p>
          </div>
        </section>

        {/* Gallery Content Section */}
        <section className="py-10 sm:py-16 bg-white overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 table-scrollbar scroll-smooth" data-reveal="fade-up">
              {CATEGORIES.map((cat) => {
                const isActive = selectedCategory === cat.value;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setSelectedCategory(cat.value)}
                    className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold tracking-tight shrink-0 transition-all min-h-[44px] cursor-pointer ${
                      isActive
                        ? 'bg-[#800020] text-white shadow-xs'
                        : 'bg-[#FAF7F2] text-stone-700 hover:bg-[#EADBDA]/60 border border-[#EADBDA]'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {/* Loading State */}
            {loading && (
              <div className="py-16 max-w-md mx-auto">
                <LoadingState
                  title="Loading School Photographs"
                  description="Retrieving published gallery photos..."
                />
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="py-12 max-w-xl mx-auto text-center">
                <ErrorState
                  title="Gallery Unavailable"
                  message={error}
                />
              </div>
            )}

            {/* Empty State (0 Published Photos) */}
            {!loading && !error && photos.length === 0 && (
              <div className="py-16 max-w-lg mx-auto">
                <EmptyState
                  title="No Published Photographs Yet"
                  description={
                    selectedCategory === 'ALL'
                      ? 'Photographs of campus activities, academic events, and school facilities will be published here soon.'
                      : `No photographs currently published under the "${selectedCategory}" category.`
                  }
                  actions={
                    selectedCategory !== 'ALL' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedCategory('ALL')}
                        className="border-[#EADBDA] text-stone-700 hover:border-[#800020] hover:text-[#800020]"
                      >
                        View All Photographs
                      </Button>
                    ) : (
                      <Link href="/admissions">
                        <Button variant="primary" size="sm" className="bg-[#800020] hover:bg-[#5B0612] text-white">
                          Apply for Admission &rarr;
                        </Button>
                      </Link>
                    )
                  }
                />
              </div>
            )}

            {/* Responsive Photo Grid */}
            {!loading && !error && photos.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                {photos.map((photo, idx) => (
                  <article
                    key={photo.id}
                    onClick={() => setActivePhoto(photo)}
                    data-reveal="scale"
                    data-delay={(idx % 6) * 60 + 50}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-[#EADBDA] bg-white shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer"
                  >
                    {/* Image Container with Consistent Ratio & Distortion Prevention */}
                    <div className="relative aspect-4/3 w-full overflow-hidden bg-stone-100 flex items-center justify-center">
                      <img
                        src={photo.imageUrl}
                        alt={photo.altText || photo.title}
                        className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300 ease-out"
                        loading="lazy"
                      />
                      <div className="absolute top-3 right-3 z-10">
                        <Badge variant="brand" size="sm" className="bg-[#5B0612]/85 text-white backdrop-blur-xs border-white/20">
                          {photo.category}
                        </Badge>
                      </div>
                    </div>

                    {/* Metadata & Caption */}
                    <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-2">
                      <div className="space-y-1">
                        <h3 className="font-bold text-base text-[#5B0612] group-hover:text-[#800020] transition-colors line-clamp-1">
                          {photo.title}
                        </h3>
                        {photo.caption && (
                          <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed">
                            {photo.caption}
                          </p>
                        )}
                      </div>

                      <div className="pt-2 flex items-center justify-between text-[11px] text-stone-400 border-t border-stone-100">
                        <span>Click to view full photo</span>
                        <span className="text-[#800020] font-semibold group-hover:translate-x-0.5 transition-transform">
                          Expand &rarr;
                        </span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Accessible Photo Lightbox Modal */}
      {activePhoto && (
        <Modal
          isOpen={Boolean(activePhoto)}
          onClose={() => setActivePhoto(null)}
          title={activePhoto.title}
          size="lg"
        >
          <div className="space-y-4">
            {/* Image Box */}
            <div className="relative max-h-[65vh] w-full overflow-hidden rounded-xl bg-stone-950 flex items-center justify-center">
              <img
                src={activePhoto.imageUrl}
                alt={activePhoto.altText || activePhoto.title}
                className="max-h-[65vh] w-auto max-w-full object-contain mx-auto"
              />
            </div>

            {/* Details */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="brand" size="sm">
                  {activePhoto.category}
                </Badge>
                {activePhoto.publishedAt && (
                  <span className="text-xs text-stone-400">
                    Published: {new Date(activePhoto.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>

              {activePhoto.caption && (
                <p className="text-sm text-stone-700 leading-relaxed pt-1">
                  {activePhoto.caption}
                </p>
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-[#EADBDA] flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActivePhoto(null)}
                className="min-h-[44px]"
              >
                Close Preview
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <PublicFooter />
    </div>
  );
}
