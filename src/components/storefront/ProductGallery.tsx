import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ProductGalleryProps {
  images: string[];
  productName: string;
}

export function ProductGallery({ images, productName }: ProductGalleryProps) {
  const safeImages = images.length > 0 ? images : ["https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1000&q=80"];
  const [activeIndex, setActiveIndex] = useState(0);

  const goPrev = () => {
    if (safeImages.length < 2) return;
    setActiveIndex((prev) => (prev === 0 ? safeImages.length - 1 : prev - 1));
  };

  const goNext = () => {
    if (safeImages.length < 2) return;
    setActiveIndex((prev) => (prev === safeImages.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] bg-[var(--sf-bg-soft)]">
        <img
          src={safeImages[activeIndex]}
          alt={`${productName} image ${activeIndex + 1}`}
          className="h-full w-full object-cover"
        />

        {safeImages.length > 1 ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--sf-line)] bg-white"
              aria-label="Previous image"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--sf-line)] bg-white"
              aria-label="Next image"
            >
              <ChevronRight size={16} />
            </button>
          </>
        ) : null}
      </div>

      {safeImages.length > 1 ? (
        <div className="grid grid-cols-4 gap-2 md:grid-cols-5">
          {safeImages.map((image, index) => (
            <button
              key={image}
              type="button"
              className={`overflow-hidden rounded-[10px] border ${
                index === activeIndex
                  ? "border-[var(--sf-accent)]"
                  : "border-[var(--sf-line)]"
              }`}
              onClick={() => setActiveIndex(index)}
              aria-label={`View image ${index + 1}`}
            >
              <img src={image} alt={`${productName} thumbnail ${index + 1}`} className="aspect-square w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
