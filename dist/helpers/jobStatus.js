"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseUiJobStatus = exports.toUiBidWorkStatus = exports.toUiOfferStatus = exports.BID_WORK_STATUS_BY_UI = exports.OFFER_STATUS_BY_UI = void 0;
exports.OFFER_STATUS_BY_UI = {
    Ongoing: ["Pending", "Accepted", "CancelRequested", "WorkCompleteRequested"],
    Finished: ["Complete"],
    Unfinished: ["Cancel", "Reject"],
};
exports.BID_WORK_STATUS_BY_UI = {
    Ongoing: ["Open", "Bidding", "Accepted", "InProgress", "WorkCompleteRequested"],
    Finished: ["Complete"],
    Unfinished: ["Cancel"],
};
const toUiOfferStatus = (status) => {
    if (status === "Complete")
        return "Finished";
    if (status === "Cancel" || status === "Reject")
        return "Unfinished";
    return "Ongoing";
};
exports.toUiOfferStatus = toUiOfferStatus;
const toUiBidWorkStatus = (status) => {
    if (status === "Complete")
        return "Finished";
    if (status === "Cancel")
        return "Unfinished";
    return "Ongoing";
};
exports.toUiBidWorkStatus = toUiBidWorkStatus;
const parseUiJobStatus = (value) => {
    if (value === "Ongoing" || value === "Finished" || value === "Unfinished") {
        return value;
    }
    return undefined;
};
exports.parseUiJobStatus = parseUiJobStatus;
