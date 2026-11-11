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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobAreaContext = exports.sameCity = exports.resolveLocation = exports.areaNameFromCoords = exports.listWorkAreas = exports.flattenWorkAreas = exports.normalizeAreaName = void 0;
const prisma_1 = __importDefault(require("../shared/prisma"));
const cms_defaults_1 = require("../app/modules/cms/cms.defaults");
const cms_locations_1 = require("../app/modules/cms/cms.locations");
const haversineDistance_1 = require("./haversineDistance");
const SAME_AREA_KM = 3;
const CITY_MATCH_KM = 40;
const CACHE_MS = 60000;
let areaCache = null;
function asRecord(value) {
    return value && typeof value === "object" ? value : {};
}
const normalizeAreaName = (value) => (value || "").trim().replace(/\s+/g, " ");
exports.normalizeAreaName = normalizeAreaName;
const flattenWorkAreas = (raw) => {
    const data = asRecord(raw);
    const cities = Array.isArray(data.cities) ? data.cities : [];
    return cities.flatMap((city) => {
        var _a;
        const item = asRecord(city);
        const cityName = (0, exports.normalizeAreaName)(String((_a = item.name) !== null && _a !== void 0 ? _a : "")) || "Dhaka";
        const areas = Array.isArray(item.areas) ? item.areas : [];
        return areas
            .map((area) => {
            var _a;
            const next = asRecord(area);
            return {
                name: (0, exports.normalizeAreaName)(String((_a = next.name) !== null && _a !== void 0 ? _a : "")),
                city: cityName,
                latitude: Number(next.latitude),
                longitude: Number(next.longitude),
            };
        })
            .filter((area) => area.name &&
            Number.isFinite(area.latitude) &&
            Number.isFinite(area.longitude));
    });
};
exports.flattenWorkAreas = flattenWorkAreas;
const listWorkAreas = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const now = Date.now();
    if (areaCache && now - areaCache.at < CACHE_MS)
        return areaCache.areas;
    const page = yield prisma_1.default.cmsPage.findUnique({ where: { slug: "locations" } });
    const areas = (0, exports.flattenWorkAreas)((0, cms_locations_1.mergeLocationDefaults)((_a = page === null || page === void 0 ? void 0 : page.data) !== null && _a !== void 0 ? _a : {}, cms_defaults_1.CMS_PAGE_DEFAULTS.locations));
    areaCache = { at: now, areas };
    return areas;
});
exports.listWorkAreas = listWorkAreas;
const matchAreaByName = (name, areas) => {
    const key = (0, exports.normalizeAreaName)(name).toLowerCase();
    if (!key)
        return undefined;
    return areas.find((area) => area.name.toLowerCase() === key);
};
const nearestArea = (latitude, longitude, areas = []) => {
    if (latitude == null || longitude == null || !areas.length)
        return undefined;
    let best;
    let bestKm = Infinity;
    for (const area of areas) {
        const km = (0, haversineDistance_1.haversineDistance)(latitude, longitude, area.latitude, area.longitude);
        if (km < bestKm) {
            bestKm = km;
            best = area;
        }
    }
    return best ? { area: best, km: bestKm } : undefined;
};
const areaNameFromCoords = (latitude, longitude, areas = []) => {
    const nearest = nearestArea(latitude, longitude, areas);
    return nearest && nearest.km <= SAME_AREA_KM ? nearest.area.name : "";
};
exports.areaNameFromCoords = areaNameFromCoords;
const resolveLocation = (point, areas) => {
    const named = point.area ? matchAreaByName(point.area, areas) : undefined;
    const nearest = nearestArea(point.latitude, point.longitude, areas);
    const area = (named === null || named === void 0 ? void 0 : named.name) ||
        (nearest && nearest.km <= SAME_AREA_KM ? nearest.area.name : "") ||
        (0, exports.normalizeAreaName)(point.area);
    const city = (named === null || named === void 0 ? void 0 : named.city) ||
        (nearest && nearest.km <= CITY_MATCH_KM ? nearest.area.city : "");
    return { area, city };
};
exports.resolveLocation = resolveLocation;
const sameCity = (left, right) => Boolean(left && right) && left.toLowerCase() === right.toLowerCase();
exports.sameCity = sameCity;
const jobAreaContext = (work, job, areas) => {
    const workLoc = (0, exports.resolveLocation)({ area: work.name, latitude: work.latitude, longitude: work.longitude }, areas);
    const jobLoc = (0, exports.resolveLocation)(job, areas);
    const workAreaName = workLoc.area;
    const jobArea = jobLoc.area;
    const outsideWorkArea = Boolean(workAreaName && jobArea) &&
        workAreaName.toLowerCase() !== jobArea.toLowerCase();
    return {
        jobArea,
        jobCity: jobLoc.city,
        workAreaName,
        workCity: workLoc.city,
        sameCity: (0, exports.sameCity)(workLoc.city, jobLoc.city),
        outsideWorkArea,
        areaWarning: outsideWorkArea
            ? `Hey, this is ${jobArea}. This is not near you.`
            : undefined,
    };
};
exports.jobAreaContext = jobAreaContext;
