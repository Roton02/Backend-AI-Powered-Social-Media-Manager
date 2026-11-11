"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelledStatusLabel = exports.isClientCancelReason = exports.CLIENT_CANCEL_REASONS = void 0;
exports.CLIENT_CANCEL_REASONS = [
    "Booked by mistake",
    "Found another technician",
    "My schedule changed",
    "Price is too high",
    "The issue is already resolved",
    "Technician is too far from my area",
    "Other",
];
const isClientCancelReason = (value) => Boolean(value && exports.CLIENT_CANCEL_REASONS.includes(value));
exports.isClientCancelReason = isClientCancelReason;
const cancelledStatusLabel = (status, cancelledBy) => {
    if (status === "CancelRequested")
        return "Cancel requested by Client";
    if (status === "Cancel") {
        if (cancelledBy === "Client")
            return "Cancelled by Client";
        if (cancelledBy === "Technician")
            return "Cancelled by Technician";
        if (cancelledBy === "Admin")
            return "Cancelled by Admin";
        return "Cancelled";
    }
    if (status === "Reject")
        return "Rejected";
    return undefined;
};
exports.cancelledStatusLabel = cancelledStatusLabel;
