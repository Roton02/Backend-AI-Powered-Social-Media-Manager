export const CLIENT_CANCEL_REASONS = [
  "Booked by mistake",
  "Found another technician",
  "My schedule changed",
  "Price is too high",
  "The issue is already resolved",
  "Technician is too far from my area",
  "Other",
] as const;

export type ClientCancelReason = (typeof CLIENT_CANCEL_REASONS)[number];

export const isClientCancelReason = (
  value?: string | null
): value is ClientCancelReason =>
  Boolean(value && (CLIENT_CANCEL_REASONS as readonly string[]).includes(value));

export const cancelledStatusLabel = (
  status?: string | null,
  cancelledBy?: string | null
) => {
  if (status === "CancelRequested") return "Cancel requested by Client";
  if (status === "Cancel") {
    if (cancelledBy === "Client") return "Cancelled by Client";
    if (cancelledBy === "Technician") return "Cancelled by Technician";
    if (cancelledBy === "Admin") return "Cancelled by Admin";
    return "Cancelled";
  }
  if (status === "Reject") return "Rejected";
  return undefined;
};
