"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { toUserFacingError } from "@/lib/ui/error_messages";

export default function ParentErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Parent Error Boundary Captured]", error);
  }, [error]);

  const userFacing = toUserFacingError(error);

  return (
    <div className="py-12 px-4 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-2xl border border-[#EADBDA] shadow-sm p-6 sm:p-8 text-center space-y-5">
        <div className="w-14 h-14 mx-auto rounded-full bg-[#FAF2F4] border border-[#EADBDA] flex items-center justify-center text-[#800020]">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-[#5B0612] tracking-tight">
            Parent Portal Notice
          </h2>
          <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
            {userFacing.message || "An error occurred while loading student information. Please retry or return to your parent overview."}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Button
            variant="primary"
            size="md"
            onClick={() => reset()}
            className="font-bold"
          >
            Retry Loading
          </Button>
          <Link href="/parent">
            <Button variant="outline" size="md">
              Parent Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
