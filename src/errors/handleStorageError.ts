import ApiError from "./ApiErrors";

type StorageLikeError = {
  name?: string;
  Code?: string;
  code?: string | number;
  http_code?: number;
  message?: string;
  $metadata?: { httpStatusCode?: number };
};

export const storageErrorCode = (error: unknown) => {
  const err = (error ?? {}) as StorageLikeError;
  return String(err.Code || err.code || err.http_code || err.name || "");
};

export const isStorageAuthError = (error: unknown) => {
  const err = (error ?? {}) as StorageLikeError;
  const code = storageErrorCode(error);
  const status = Number(err.http_code || err.$metadata?.httpStatusCode || 0);
  return (
    status === 401 ||
    status === 403 ||
    code === "401" ||
    code === "403" ||
    /invalid.*(api.?key|cloud.?name|signature|credentials)/i.test(err.message || "")
  );
};

export const isStorageSdkError = (error: unknown) => {
  const err = (error ?? {}) as {
    $metadata?: unknown;
    $fault?: unknown;
    http_code?: number;
    error?: { http_code?: number };
  };
  return (
    Boolean(err.$metadata || err.$fault || err.http_code || err.error?.http_code) ||
    isStorageAuthError(error)
  );
};

export const storageErrorToApiError = (error: unknown) => {
  const err = (error ?? {}) as StorageLikeError;
  const status = Number(err.http_code || err.$metadata?.httpStatusCode || 0);
  const message = err.message || "";

  if (status === 401 || /invalid.*(api.?key|cloud.?name|signature)/i.test(message)) {
    return new ApiError(
      503,
      "Cloudinary credentials are invalid. Update CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in backend/.env.",
    );
  }
  if (status === 400 || /file size too large/i.test(message)) {
    return new ApiError(
      400,
      "This file is too large for Cloudinary's free plan (images max 10MB). Try a smaller photo.",
    );
  }
  if (message) {
    return new ApiError(503, `Could not upload the file. ${message}`);
  }
  return new ApiError(503, "Could not upload the file right now. Please try again.");
};
