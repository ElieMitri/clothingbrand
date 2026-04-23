import { useEffect, useState, type SyntheticEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toFastImageUrl } from "../../lib/image";

interface ProductGalleryProps {
  images: string[];
  productName: string;
}

export function ProductGallery({ images, productName }: ProductGalleryProps) {
  const FALLBACK_IMAGE =
    "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1000&q=80";
  const normalizedImages = images
    .map((image) => String(image || "").trim())
    .filter(Boolean);
  const safeImages = normalizedImages.length > 0 ? normalizedImages : [FALLBACK_IMAGE];
  const optimizedMainImages = safeImages.map((image) => toFastImageUrl(image, 1200));
  const optimizedThumbImages = safeImages.map((image) => toFastImageUrl(image, 320));
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (activeIndex < safeImages.length) return;
    setActiveIndex(0);
  }, [activeIndex, safeImages.length]);

  const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    if (image.dataset.fallbackApplied === "1") return;
    image.dataset.fallbackApplied = "1";
    image.src = FALLBACK_IMAGE;
  };

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
      <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--sf-radius-lg)] border border-[var(--sf-line)] bg-[var(--sf-bg-soft)]">
        <img
          src={optimizedMainImages[activeIndex]}
          alt={`${productName} image ${activeIndex + 1}`}
          className="block h-full w-full object-cover"
          loading="eager"
          fetchPriority="high"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={handleImageError}
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
              <img
                src={optimizedThumbImages[index]}
                alt={`${productName} thumbnail ${index + 1}`}
                className="block aspect-square w-full object-cover"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={handleImageError}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
