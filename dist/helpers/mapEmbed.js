"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapSrcFromCoords = mapSrcFromCoords;
exports.extractMapCoords = extractMapCoords;
exports.toMapEmbedSrc = toMapEmbedSrc;
exports.resolveMapEmbedSrc = resolveMapEmbedSrc;
function mapSrcFromCoords(lat, lng, zoom = 16) {
    return `https://maps.google.com/maps?q=${lat},${lng}&z=${zoom}&output=embed`;
}
function extractMapCoords(link) {
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
function isShortMapLink(link) {
    return /maps\.app\.goo\.gl|goo\.gl\/maps/i.test(link);
}
function toMapEmbedSrc(link) {
    var _a, _b;
    const raw = link === null || link === void 0 ? void 0 : link.trim();
    if (!raw)
        return undefined;
    const iframeSrc = (_a = raw.match(/src=["']([^"']+)["']/i)) === null || _a === void 0 ? void 0 : _a[1];
    if (iframeSrc)
        return toMapEmbedSrc(iframeSrc);
    if (/\/maps\/embed/i.test(raw) || /[?&]output=embed/i.test(raw))
        return raw;
    const coords = extractMapCoords(raw);
    if (coords)
        return mapSrcFromCoords(coords.lat, coords.lng);
    if (isShortMapLink(raw))
        return undefined;
    try {
        const url = new URL(raw);
        if (url.hostname.includes("google.") && url.pathname.includes("maps")) {
            const place = (_b = url.pathname.split("/place/")[1]) === null || _b === void 0 ? void 0 : _b.split("/")[0];
            if (place) {
                return `https://maps.google.com/maps?q=${encodeURIComponent(place)}&z=16&output=embed`;
            }
        }
    }
    catch (_c) {
        return undefined;
    }
    return undefined;
}
function resolveMapEmbedSrc(link) {
    return __awaiter(this, void 0, void 0, function* () {
        const direct = toMapEmbedSrc(link);
        if (direct)
            return direct;
        const raw = link === null || link === void 0 ? void 0 : link.trim();
        if (!raw || !isShortMapLink(raw))
            return undefined;
        try {
            const response = yield fetch(raw, {
                redirect: "follow",
                headers: { "User-Agent": "Mozilla/5.0" },
            });
            return toMapEmbedSrc(response.url);
        }
        catch (_a) {
            return undefined;
        }
    });
}
