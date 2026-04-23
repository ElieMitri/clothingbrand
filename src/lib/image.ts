const cleanUrl = (value: string) => String(value || "").trim();

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

export const toFastImageUrl = (input: string, width: number) => {
  const raw = cleanUrl(input);
  if (!raw || !isHttpUrl(raw)) return raw;

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();

    if (host.includes("images.unsplash.com")) {
      url.searchParams.set("auto", "format");
      url.searchParams.set("fit", "crop");
      url.searchParams.set("q", "75");
      url.searchParams.set("w", String(Math.max(200, Math.round(width))));
      url.searchParams.set("dpr", "1");
      return url.toString();
    }

    if (host.includes("res.cloudinary.com")) {
      return raw
        .replace("/upload/", `/upload/f_auto,q_auto,w_${Math.max(200, Math.round(width))}/`)
        .replace(/\/{2,}/g, "/")
        .replace("https:/", "https://");
    }

    return raw;
  } catch {
    return raw;
  }
};

