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
exports.startBookingCancelCron = exports.processExpiredCancelRequests = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const prisma_1 = __importDefault(require("../shared/prisma"));
const notifyUsers_1 = require("./notifyUsers");
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const processExpiredCancelRequests = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const cutoff = new Date(Date.now() - THREE_HOURS_MS);
    const expiredBookings = yield prisma_1.default.offerBooking.findMany({
        where: {
            status: "CancelRequested",
            cancelRequestAt: { lte: cutoff },
        },
        include: {
            user: true,
            technicianProfile: { include: { technician: true } },
        },
    });
    for (const booking of expiredBookings) {
        yield prisma_1.default.offerBooking.update({
            where: { id: booking.id },
            data: { status: "Cancel" },
        });
        const userIds = [booking.userId, (_a = booking.technicianProfile) === null || _a === void 0 ? void 0 : _a.technicianId].filter(Boolean);
        yield (0, notifyUsers_1.notifyUsers)({
            title: "Booking cancelled",
            message: "Cancel request was auto-approved after 3 hours.",
            redirectEndpoint: `/bookings/${booking.id}`,
            userIds,
            eventType: "booking-cancelled",
            eventData: { bookingId: booking.id },
        });
    }
});
exports.processExpiredCancelRequests = processExpiredCancelRequests;
const startBookingCancelCron = () => {
    node_cron_1.default.schedule("*/15 * * * *", () => {
        (0, exports.processExpiredCancelRequests)().catch(console.error);
    });
};
exports.startBookingCancelCron = startBookingCancelCron;
