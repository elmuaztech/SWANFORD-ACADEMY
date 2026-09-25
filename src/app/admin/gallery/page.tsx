"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  Badge,
  Button,
  Input,
  Select,
  Modal,
  Alert,
  FormGroup,
  LoadingState,
  ErrorState,
  EmptyState,
  PageHeader,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  TableWrapper,
  TableMobileCard,
} from "@/components";
import { GalleryCategory, GALLERY_CATEGORIES } from "@/lib/gallery/types";

interface GalleryItemMedia {
  id: string;
  url: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
}

interface GalleryItemData {
  id: string;
  title: string;
  caption: string | null;
  category: GalleryCategory;
  altText: string;
  displayOrder: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  mediaAssetId: string;
  mediaAsset: GalleryItemMedia;
  uploadedBy?: {
    id: string;
    email: string;
  };
}

const CATEGORY_LABELS: Record<GalleryCategory, string> = {
  CAMPUS: "Campus & Grounds",
  ACADEMICS: "Academics & Classroom",
  ACTIVITIES: "Sports & Activities",
  FACILITIES: "School Facilities & Labs",
  TAHFEEZ: "Tahfeez & Quranic Studies",
};

export default function AdminGalleryPage() {
  const [items, setItems] = useState<GalleryItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bannerNotice, setBannerNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState<GalleryCategory>("ACADEMICS");
  const [uploadAltText, setUploadAltText] = useState("");
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadOrder, setUploadOrder] = useState("0");
  const [uploadIsPublished, setUploadIsPublished] = useState(true);
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<GalleryItemData | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState<GalleryCategory>("ACADEMICS");
  const [editAltText, setEditAltText] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const [editOrder, setEditOrder] = useState("0");
  const [editIsPublished, setEditIsPublished] = useState(true);
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editPreview, setEditPreview] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const editFileInputRef = useRef<HTMLInputElement | null>(null);

  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingItem, setDeletingItem] = useState<GalleryItemData | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Quick Toggle Publishing Loading State (by ID)
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (categoryFilter && categoryFilter !== "ALL") params.append("category", categoryFilter);
      if (statusFilter && statusFilter !== "all") params.append("status", statusFilter);
      if (searchQuery.trim()) params.append("search", searchQuery.trim());
      params.append("page", page.toString());
      params.append("pageSize", "24");

      const res = await fetch(`/api/admin/gallery?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load gallery items.");
      }

      setItems(data.items || []);
      setTotalCount(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error retrieving gallery items.");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, statusFilter, searchQuery, page]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (uploadPreview) URL.revokeObjectURL(uploadPreview);
      if (editPreview) URL.revokeObjectURL(editPreview);
    };
  }, [uploadPreview, editPreview]);

  // Quick Publish/Unpublish Toggle
  const handleTogglePublish = async (item: GalleryItemData) => {
    setTogglingId(item.id);
    try {
      const res = await fetch(`/api/admin/gallery/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: !item.isPublished }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update publication status.");
      }

      // Update in state
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, isPublished: !it.isPublished } : it))
      );
      setBannerNotice({
        type: "success",
        message: `"${item.title}" is now ${!item.isPublished ? "published to the public gallery" : "saved as draft"}.`,
      });
    } catch (err: unknown) {
      setBannerNotice({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to toggle publication status.",
      });
    } finally {
      setTogglingId(null);
    }
  };

  // Handle File Selection for Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setUploadError("Invalid image format. Only JPEG, PNG, and WebP are allowed.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadError("Photograph exceeds 10MB limit. Please select an optimized file.");
      return;
    }

    setUploadError(null);
    setUploadFile(file);
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadPreview(URL.createObjectURL(file));

    // Auto-suggest title if blank
    if (!uploadTitle.trim()) {
      const cleanName = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
      setUploadTitle(cleanName);
    }
  };

  // Submit Upload
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);

    if (!uploadFile) {
      setUploadError("Please select a photograph file to upload.");
      return;
    }
    if (!uploadTitle.trim()) {
      setUploadError("Photograph title is required.");
      return;
    }
    if (!uploadAltText.trim()) {
      setUploadError("Accessible alt text is required for screen readers and search engines.");
      return;
    }

    setUploadSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("title", uploadTitle.trim());
      formData.append("category", uploadCategory);
      formData.append("altText", uploadAltText.trim());
      if (uploadCaption.trim()) formData.append("caption", uploadCaption.trim());
      formData.append("displayOrder", uploadOrder);
      formData.append("isPublished", uploadIsPublished ? "true" : "false");

      const res = await fetch("/api/admin/gallery", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to upload gallery photograph.");
      }

      setShowUploadModal(false);
      // Reset form
      setUploadFile(null);
      if (uploadPreview) URL.revokeObjectURL(uploadPreview);
      setUploadPreview(null);
      setUploadTitle("");
      setUploadCategory("ACADEMICS");
      setUploadAltText("");
      setUploadCaption("");
      setUploadOrder("0");
      setUploadIsPublished(true);

      setBannerNotice({
        type: "success",
        message: "Photograph uploaded, optimized to WebP, and added to the gallery successfully.",
      });
      fetchItems();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Failed to upload photograph.");
    } finally {
      setUploadSubmitting(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (item: GalleryItemData) => {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditCategory(item.category);
    setEditAltText(item.altText);
    setEditCaption(item.caption || "");
    setEditOrder(item.displayOrder.toString());
    setEditIsPublished(item.isPublished);
    setEditFile(null);
    if (editPreview) URL.revokeObjectURL(editPreview);
    setEditPreview(null);
    setEditError(null);
    setShowEditModal(true);
  };

  // Handle File Selection for Edit Replacement
  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setEditError("Invalid image format. Only JPEG, PNG, and WebP are allowed.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setEditError("Photograph exceeds 10MB limit.");
      return;
    }

    setEditError(null);
    setEditFile(file);
    if (editPreview) URL.revokeObjectURL(editPreview);
    setEditPreview(URL.createObjectURL(file));
  };

  // Submit Edit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setEditError(null);

    if (!editTitle.trim()) {
      setEditError("Photograph title is required.");
      return;
    }
    if (!editAltText.trim()) {
      setEditError("Accessible alt text is required.");
      return;
    }

    setEditSubmitting(true);
    try {
      let res: Response;

      if (editFile) {
        // Multipart if replacing photo
        const formData = new FormData();
        formData.append("file", editFile);
        formData.append("title", editTitle.trim());
        formData.append("category", editCategory);
        formData.append("altText", editAltText.trim());
        formData.append("caption", editCaption.trim());
        formData.append("displayOrder", editOrder);
        formData.append("isPublished", editIsPublished ? "true" : "false");

        res = await fetch(`/api/admin/gallery/${editingItem.id}`, {
          method: "PATCH",
          body: formData,
        });
      } else {
        // JSON if metadata only
        res = await fetch(`/api/admin/gallery/${editingItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editTitle.trim(),
            category: editCategory,
            altText: editAltText.trim(),
            caption: editCaption.trim() || null,
            displayOrder: parseInt(editOrder, 10) || 0,
            isPublished: editIsPublished,
          }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update photograph.");
      }

      setShowEditModal(false);
      setEditingItem(null);
      setBannerNotice({
        type: "success",
        message: "Photograph details updated successfully.",
      });
      fetchItems();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update photograph.");
    } finally {
      setEditSubmitting(false);
    }
  };

  // Open Delete Modal
  const handleOpenDelete = (item: GalleryItemData) => {
    setDeletingItem(item);
    setDeleteError(null);
    setShowDeleteModal(true);
  };

  // Submit Delete
  const handleDeleteSubmit = async () => {
    if (!deletingItem) return;
    setDeleteSubmitting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/admin/gallery/${deletingItem.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to delete photograph.");
      }

      setShowDeleteModal(false);
      setDeletingItem(null);
      setBannerNotice({
        type: "success",
        message: "Photograph removed permanently from gallery and storage.",
      });
      fetchItems();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete photograph.");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // Metrics
  const publishedCount = items.filter((i) => i.isPublished).length;
  const draftCount = items.filter((i) => !i.isPublished).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <PageHeader
        title="School Gallery Management"
        description="Curate, publish, and manage verified institutional photographs displayed on the public gallery."
        badge={<Badge variant="brand" size="sm">Super Admin Exclusive</Badge>}
        actions={
          <Button
            variant="primary"
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>Upload Photo</span>
          </Button>
        }
      />

      {/* Banner Feedback */}
      {bannerNotice && (
        <Alert
          variant={bannerNotice.type === "success" ? "success" : "danger"}
          title={bannerNotice.type === "success" ? "Operation Successful" : "Attention Required"}
          onClose={() => setBannerNotice(null)}
        >
          {bannerNotice.message}
        </Alert>
      )}

      {/* Metrics Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-[#EADBDA]/80 bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500 font-display">
                Total Photographs
              </p>
              <p className="text-2xl font-extrabold text-stone-900 mt-1 font-display">
                {totalCount}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#FDF2F4] text-[#800020] flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#EADBDA]/80 bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500 font-display">
                Published Online
              </p>
              <p className="text-2xl font-extrabold text-emerald-700 mt-1 font-display">
                {publishedCount}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#EADBDA]/80 bg-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500 font-display">
                Draft / Unpublished
              </p>
              <p className="text-2xl font-extrabold text-amber-700 mt-1 font-display">
                {draftCount}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.75" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Toolbar Bar */}
      <Card className="border-[#EADBDA]/80 bg-white">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 max-w-sm">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by title or caption..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-[#800020] focus:border-transparent"
                />
                <svg
                  className="w-4 h-4 text-stone-400 absolute left-3 top-2.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
              </div>

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(1);
                }}
                className="py-2 px-3 text-xs rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#800020] focus:border-transparent font-medium"
              >
                <option value="ALL">All Categories</option>
                {GALLERY_CATEGORIES.map((catKey) => (
                  <option key={catKey} value={catKey}>
                    {CATEGORY_LABELS[catKey]}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="py-2 px-3 text-xs rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#800020] focus:border-transparent font-medium"
              >
                <option value="all">All Statuses</option>
                <option value="published">Published Only</option>
                <option value="unpublished">Draft / Unpublished</option>
              </select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 self-end sm:self-auto border border-stone-200 rounded-lg p-0.5 bg-stone-50">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  viewMode === "grid"
                    ? "bg-white text-[#800020] shadow-xs"
                    : "text-stone-500 hover:text-stone-900"
                }`}
                title="Grid Card View"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
                </svg>
                <span className="hidden sm:inline">Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`p-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  viewMode === "table"
                    ? "bg-white text-[#800020] shadow-xs"
                    : "text-stone-500 hover:text-stone-900"
                }`}
                title="Table View"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M3.75 4.5h16.5m-16.5 3.75h16.5" />
                </svg>
                <span className="hidden sm:inline">Table</span>
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Area */}
      {loading ? (
        <LoadingState message="Loading gallery archives..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchItems} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No Photographs Found"
          description={
            searchQuery || categoryFilter !== "ALL" || statusFilter !== "all"
              ? "No photos match your filter parameters. Try clearing your search query or filters."
              : "No institutional photographs have been uploaded yet. Upload genuine photographs to populate the school gallery."
          }
          actions={
            <Button variant="primary" onClick={() => setShowUploadModal(true)}>
              Upload First Photograph
            </Button>
          }
        />
      ) : viewMode === "grid" ? (
        /* Grid / Card View */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {items.map((item) => (
            <Card
              key={item.id}
              className="overflow-hidden border-[#EADBDA]/80 bg-white hover:shadow-md transition-shadow flex flex-col"
            >
              {/* Image Preview Container */}
              <div className="relative aspect-4/3 w-full bg-stone-100 overflow-hidden border-b border-stone-200">
                <img
                  src={`/api/media/${item.mediaAssetId}`}
                  alt={item.altText}
                  className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                  loading="lazy"
                />

                {/* Category Badge */}
                <div className="absolute top-2 left-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-stone-900/80 text-white backdrop-blur-xs">
                    {CATEGORY_LABELS[item.category] || item.category}
                  </span>
                </div>

                {/* Publish Badge */}
                <div className="absolute top-2 right-2">
                  {item.isPublished ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-700 text-white shadow-xs">
                      Published
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-600 text-white shadow-xs">
                      Draft
                    </span>
                  )}
                </div>

                {/* Display Order Pill */}
                {item.displayOrder !== 0 && (
                  <div className="absolute bottom-2 right-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-white/90 text-stone-700 shadow-xs">
                      Order: {item.displayOrder}
                    </span>
                  </div>
                )}
              </div>

              {/* Card Body */}
              <CardContent className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-[#5B0612] line-clamp-1 font-display" title={item.title}>
                    {item.title}
                  </h3>
                  {item.caption && (
                    <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed" title={item.caption}>
                      {item.caption}
                    </p>
                  )}
                  <p className="text-[11px] text-stone-400 truncate italic" title={item.altText}>
                    Alt: {item.altText}
                  </p>
                </div>

                {/* Actions Toolbar */}
                <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-1">
                  {/* Quick Toggle Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTogglePublish(item)}
                    isLoading={togglingId === item.id}
                    className="text-[11px] py-1 px-2 h-7"
                    title={item.isPublished ? "Switch to Draft" : "Publish to Gallery"}
                  >
                    {item.isPublished ? "Unpublish" : "Publish"}
                  </Button>

                  <div className="flex items-center gap-1">
                    {/* Edit Button */}
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(item)}
                      className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
                      title="Edit Photograph Details"
                      aria-label="Edit Photograph Details"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                      </svg>
                    </button>

                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={() => handleOpenDelete(item)}
                      className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                      title="Delete Photograph"
                      aria-label="Delete Photograph"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* Table View */
        <TableWrapper>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Photo</TableHeaderCell>
                <TableHeaderCell>Title & Caption</TableHeaderCell>
                <TableHeaderCell>Category</TableHeaderCell>
                <TableHeaderCell>Alt Text</TableHeaderCell>
                <TableHeaderCell>Order</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell align="right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="w-14 h-11 rounded-lg overflow-hidden bg-stone-100 border border-stone-200 shrink-0">
                      <img
                        src={`/api/media/${item.mediaAssetId}`}
                        alt={item.altText}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-stone-900 font-display">{item.title}</p>
                      {item.caption && (
                        <p className="text-[11px] text-stone-500 line-clamp-1">{item.caption}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="neutral" size="sm">
                      {CATEGORY_LABELS[item.category] || item.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <p className="text-xs text-stone-500 line-clamp-1 max-w-xs">{item.altText}</p>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-stone-700">{item.displayOrder}</span>
                  </TableCell>
                  <TableCell>
                    {item.isPublished ? (
                      <Badge variant="success" size="sm">Published</Badge>
                    ) : (
                      <Badge variant="warning" size="sm">Draft</Badge>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTogglePublish(item)}
                        isLoading={togglingId === item.id}
                        className="text-xs h-8"
                      >
                        {item.isPublished ? "Unpublish" : "Publish"}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenEdit(item)}
                        className="text-xs h-8"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleOpenDelete(item)}
                        className="text-xs h-8"
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Mobile Fallback for Table */}
          <div className="md:hidden space-y-3 p-3">
            {items.map((item) => (
              <TableMobileCard
                key={item.id}
                title={item.title}
                subtitle={item.caption || undefined}
                badge={
                  item.isPublished ? (
                    <Badge variant="success" size="sm">Published</Badge>
                  ) : (
                    <Badge variant="warning" size="sm">Draft</Badge>
                  )
                }
                fields={[
                  { label: "Category", value: CATEGORY_LABELS[item.category] || item.category },
                  { label: "Display Order", value: item.displayOrder },
                  { label: "Alt Text", value: item.altText },
                ]}
                actions={
                  <div className="flex items-center gap-2 w-full">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTogglePublish(item)}
                      isLoading={togglingId === item.id}
                      className="flex-1 text-xs"
                    >
                      {item.isPublished ? "Unpublish" : "Publish"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenEdit(item)}
                      className="flex-1 text-xs"
                    >
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleOpenDelete(item)}
                      className="flex-1 text-xs"
                    >
                      Delete
                    </Button>
                  </div>
                }
              />
            ))}
          </div>
        </TableWrapper>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-stone-200">
          <p className="text-xs text-stone-500">
            Showing page {page} of {totalPages} ({totalCount} total photos)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* UPLOAD MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={showUploadModal}
        onClose={() => {
          if (!uploadSubmitting) {
            setShowUploadModal(false);
            setUploadError(null);
          }
        }}
        title="Upload Verified School Photograph"
        size="lg"
      >
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          {uploadError && (
            <Alert variant="danger" title="Upload Error">
              {uploadError}
            </Alert>
          )}

          {/* File Picker / Drag & Drop Area */}
          <FormGroup label="Select Photograph File" required>
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                uploadPreview
                  ? "border-[#800020]/40 bg-[#FDF2F4]/30"
                  : "border-stone-300 hover:border-[#800020] bg-stone-50 hover:bg-stone-100/60"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />

              {uploadPreview ? (
                <div className="space-y-3">
                  <div className="max-h-56 mx-auto rounded-lg overflow-hidden bg-white shadow-sm inline-block">
                    <img
                      src={uploadPreview}
                      alt="Preview"
                      className="max-h-56 object-contain rounded-lg"
                    />
                  </div>
                  <p className="text-xs font-semibold text-stone-700">
                    {uploadFile?.name} ({(uploadFile?.size ? (uploadFile.size / 1024).toFixed(0) : 0)} KB)
                  </p>
                  <p className="text-[11px] text-[#800020] font-medium underline">
                    Click to choose a different photo
                  </p>
                </div>
              ) : (
                <div className="space-y-2 py-4">
                  <div className="w-12 h-12 mx-auto rounded-full bg-[#FDF2F4] text-[#800020] flex items-center justify-center">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-stone-800">
                      Click to browse or drop an institutional photograph here
                    </p>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      JPEG, PNG, or WebP format up to 10MB. Will be safely converted to WebP with metadata stripped.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </FormGroup>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Title */}
            <FormGroup label="Photograph Title" required>
              <Input
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="e.g., Annual Science Exhibition 2026"
                required
              />
            </FormGroup>

            {/* Category */}
            <FormGroup label="Gallery Category" required>
              <Select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value as GalleryCategory)}
                required
              >
                {GALLERY_CATEGORIES.map((catKey) => (
                  <option key={catKey} value={catKey}>
                    {CATEGORY_LABELS[catKey]}
                  </option>
                ))}
              </Select>
            </FormGroup>
          </div>

          {/* Alt Text (Required for A11y) */}
          <FormGroup
            label="Accessible Alt Text"
            required
            helperText="Accurate description of the visual scene for visually impaired visitors and SEO."
          >
            <Input
              type="text"
              value={uploadAltText}
              onChange={(e) => setUploadAltText(e.target.value)}
              placeholder="e.g., Swanford primary students presenting robotics projects in the STEM laboratory"
              required
            />
          </FormGroup>

          {/* Caption */}
          <FormGroup label="Institutional Caption (Optional)" helperText="Brief context or achievement highlight.">
            <textarea
              value={uploadCaption}
              onChange={(e) => setUploadCaption(e.target.value)}
              rows={2}
              placeholder="e.g., Students demonstrating their automated irrigation prototype during the annual science expo."
              className="w-full text-xs rounded-xl border border-stone-300 p-2.5 focus:outline-none focus:ring-2 focus:ring-[#800020] focus:border-transparent font-sans"
            />
          </FormGroup>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            {/* Display Order */}
            <FormGroup label="Display Order" helperText="Lower numbers appear first (0 = default).">
              <Input
                type="number"
                value={uploadOrder}
                onChange={(e) => setUploadOrder(e.target.value)}
                min="0"
                step="1"
              />
            </FormGroup>

            {/* Publication Status Toggle */}
            <div className="pt-3">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={uploadIsPublished}
                  onChange={(e) => setUploadIsPublished(e.target.checked)}
                  className="w-4 h-4 text-[#800020] rounded border-stone-300 focus:ring-[#800020]"
                />
                <div>
                  <p className="text-xs font-bold text-stone-900">Publish Immediately</p>
                  <p className="text-[11px] text-stone-500">
                    If checked, photograph will be immediately viewable on the public gallery.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowUploadModal(false)}
              disabled={uploadSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={uploadSubmitting}
              disabled={uploadSubmitting}
            >
              {uploadSubmitting ? "Processing WebP..." : "Upload & Save"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* EDIT MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          if (!editSubmitting) {
            setShowEditModal(false);
            setEditingItem(null);
            setEditError(null);
          }
        }}
        title="Edit Photograph Details"
        size="lg"
      >
        {editingItem && (
          <form onSubmit={handleEditSubmit} className="space-y-4">
            {editError && (
              <Alert variant="danger" title="Update Error">
                {editError}
              </Alert>
            )}

            {/* Current Image / Replace Dropzone */}
            <div className="flex items-center gap-4 p-3 bg-stone-50 rounded-xl border border-stone-200">
              <div className="w-24 h-20 rounded-lg overflow-hidden bg-stone-200 shrink-0 border border-stone-300">
                <img
                  src={editPreview || `/api/media/${editingItem.mediaAssetId}`}
                  alt={editingItem.altText}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-bold text-stone-900 truncate">
                  {editFile ? editFile.name : editingItem.title}
                </p>
                <p className="text-[11px] text-stone-500">
                  {editFile
                    ? `Replacing with: ${(editFile.size / 1024).toFixed(0)} KB`
                    : `Original Dimensions: ${editingItem.mediaAsset.width || "Auto"} x ${editingItem.mediaAsset.height || "Auto"} px`}
                </p>
                <button
                  type="button"
                  onClick={() => editFileInputRef.current?.click()}
                  className="text-xs text-[#800020] font-bold hover:underline"
                >
                  {editFile ? "Change replacement photo" : "Replace photograph file"}
                </button>
                <input
                  ref={editFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleEditFileChange}
                  className="hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Title */}
              <FormGroup label="Photograph Title" required>
                <Input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                />
              </FormGroup>

              {/* Category */}
              <FormGroup label="Gallery Category" required>
                <Select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as GalleryCategory)}
                  required
                >
                  {GALLERY_CATEGORIES.map((catKey) => (
                    <option key={catKey} value={catKey}>
                      {CATEGORY_LABELS[catKey]}
                    </option>
                  ))}
                </Select>
              </FormGroup>
            </div>

            {/* Alt Text */}
            <FormGroup label="Accessible Alt Text" required>
              <Input
                type="text"
                value={editAltText}
                onChange={(e) => setEditAltText(e.target.value)}
                required
              />
            </FormGroup>

            {/* Caption */}
            <FormGroup label="Caption (Optional)">
              <textarea
                value={editCaption}
                onChange={(e) => setEditCaption(e.target.value)}
                rows={2}
                className="w-full text-xs rounded-xl border border-stone-300 p-2.5 focus:outline-none focus:ring-2 focus:ring-[#800020] focus:border-transparent font-sans"
              />
            </FormGroup>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              {/* Display Order */}
              <FormGroup label="Display Order">
                <Input
                  type="number"
                  value={editOrder}
                  onChange={(e) => setEditOrder(e.target.value)}
                  min="0"
                />
              </FormGroup>

              {/* Publication Status Toggle */}
              <div className="pt-3">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editIsPublished}
                    onChange={(e) => setEditIsPublished(e.target.checked)}
                    className="w-4 h-4 text-[#800020] rounded border-stone-300 focus:ring-[#800020]"
                  />
                  <div>
                    <p className="text-xs font-bold text-stone-900">Published to Gallery</p>
                    <p className="text-[11px] text-stone-500">
                      Uncheck to set status to draft.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEditModal(false)}
                disabled={editSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={editSubmitting}
                disabled={editSubmitting}
              >
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* DELETE CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          if (!deleteSubmitting) {
            setShowDeleteModal(false);
            setDeletingItem(null);
            setDeleteError(null);
          }
        }}
        title="Delete Photograph Permanently"
        size="md"
      >
        {deletingItem && (
          <div className="space-y-4">
            {deleteError && (
              <Alert variant="danger" title="Deletion Error">
                {deleteError}
              </Alert>
            )}

            <div className="flex items-center gap-4 p-3 bg-rose-50/60 rounded-xl border border-rose-200">
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-stone-200 shrink-0 border border-rose-200">
                <img
                  src={`/api/media/${deletingItem.mediaAssetId}`}
                  alt={deletingItem.altText}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-stone-900">{deletingItem.title}</p>
                <p className="text-[11px] text-stone-500">
                  Category: {CATEGORY_LABELS[deletingItem.category] || deletingItem.category}
                </p>
              </div>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Are you sure you want to permanently delete this photograph? This will remove it from the public gallery, unbind it from institutional records, and securely purge the file from disk storage.
            </p>
            <p className="text-xs font-bold text-rose-700">
              This action cannot be undone.
            </p>

            <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleteSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleDeleteSubmit}
                isLoading={deleteSubmitting}
                disabled={deleteSubmitting}
              >
                Delete Photograph
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
