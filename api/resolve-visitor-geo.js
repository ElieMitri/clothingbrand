const normalizeIpFromHeader = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.split(",")[0].trim();
};

const isPrivateOrLocalIp = (ip) => {
  if (!ip) return true;
  const normalized = String(ip).trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === "::1" || normalized === "127.0.0.1") return true;
  const ipv4Match = normalized.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const first = Number(ipv4Match[1]);
    const second = Number(ipv4Match[2]);
    if (first === 10) return true;
    if (first === 127) return true;
    if (first === 192 && second === 168) return true;
    if (first === 172 && second >= 16 && second <= 31) return true;
    return false;
  }
  return (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  );
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const forwardedFor = normalizeIpFromHeader(req.headers["x-forwarded-for"]);
    const fallbackIp = normalizeIpFromHeader(req.socket?.remoteAddress);
    const candidateIp = forwardedFor || fallbackIp;
    const ip = isPrivateOrLocalIp(candidateIp) ? "" : candidateIp;

    const providerUrl = ip
      ? `https://ipwho.is/${encodeURIComponent(ip)}`
      : "https://ipwho.is/";
    const response = await fetch(providerUrl);
    const body = await response.json();

    if (!response.ok || !body?.success) {
      return res.status(200).json({
        city: "",
        region: "",
        country: "",
        countryCode: "",
      });
    }

    return res.status(200).json({
      city: String(body.city || "").trim(),
      region: String(body.region || "").trim(),
      country: String(body.country || "").trim(),
      countryCode: String(body.country_code || "").trim(),
    });
  } catch (error) {
    console.error("resolve-visitor-geo error:", error);
    return res.status(200).json({
      city: "",
      region: "",
      country: "",
      countryCode: "",
    });
  }
}
