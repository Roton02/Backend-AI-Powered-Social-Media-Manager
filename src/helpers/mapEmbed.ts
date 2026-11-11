export function mapSrcFromCoords(lat: number, lng: number, zoom = 16) {
  return `https://maps.google.com/maps?q=${lat},${lng}&z=${zoom}&output=embed`;
}

export function extractMapCoords(link: string) {
  const decoded = decodeURIComponent(link);
  const precise = decoded.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (precise) {
    return { lat: Number(precise[1]), lng: Number(precise[2]) };
  }
  const at = decoded.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) {
    return { lat: Number(at[1]), lng: Number(at[2]) };
  }
  const query = decoded.match(/[?&](?:q|ll|query)=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/i);
  if (query) {
    return { lat: Number(query[1]), lng: Number(query[2]) };
  }
  return undefined;
}

function isShortMapLink(link: string) {
  return /maps\.app\.goo\.gl|goo\.gl\/maps/i.test(link);
}

export function toMapEmbedSrc(link?: string | null) {
  const raw = link?.trim();
  if (!raw) return undefined;

  const iframeSrc = raw.match(/src=["']([^"']+)["']/i)?.[1];
  if (iframeSrc) return toMapEmbedSrc(iframeSrc);

  if (/\/maps\/embed/i.test(raw) || /[?&]output=embed/i.test(raw)) return raw;

  const coords = extractMapCoords(raw);
  if (coords) return mapSrcFromCoords(coords.lat, coords.lng);

  if (isShortMapLink(raw)) return undefined;

  try {
    const url = new URL(raw);
    if (url.hostname.includes("google.") && url.pathname.includes("maps")) {
      const place = url.pathname.split("/place/")[1]?.split("/")[0];
      if (place) {
        return `https://maps.google.com/maps?q=${encodeURIComponent(place)}&z=16&output=embed`;
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export async function resolveMapEmbedSrc(link?: string | null) {
  const direct = toMapEmbedSrc(link);
  if (direct) return direct;
  const raw = link?.trim();
  if (!raw || !isShortMapLink(raw)) return undefined;

  try {
    const response = await fetch(raw, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    return toMapEmbedSrc(response.url);
  } catch {
    return undefined;
  }
}
