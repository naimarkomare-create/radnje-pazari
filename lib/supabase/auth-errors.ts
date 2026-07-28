type AuthErrorLike = {
  name?: unknown;
  status?: unknown;
  code?: unknown;
};

const INVALID_SESSION_CODES = new Set([
  "bad_jwt",
  "refresh_token_not_found",
  "refresh_token_already_used",
  "session_not_found",
  "user_banned",
  "user_not_found"
]);

export function isConfirmedInvalidSessionError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const { name, status, code } = error as AuthErrorLike;
  const normalizedName = typeof name === "string" ? name : "";
  const normalizedCode = typeof code === "string" ? code : "";
  const normalizedStatus = typeof status === "number" ? status : null;

  if (
    normalizedName === "AuthSessionMissingError" ||
    normalizedName === "AuthInvalidJwtError" ||
    normalizedName === "AuthInvalidTokenResponseError"
  ) {
    return true;
  }

  if (normalizedName === "AuthRetryableFetchError" || normalizedStatus === 0) {
    return false;
  }

  if (INVALID_SESSION_CODES.has(normalizedCode)) {
    return true;
  }

  return (
    normalizedName === "AuthApiError" &&
    normalizedStatus !== null &&
    normalizedStatus >= 400 &&
    normalizedStatus < 500 &&
    normalizedStatus !== 429
  );
}

export function safeAuthErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return { name: "Unknown", status: null, code: null };
  }

  const { name, status, code } = error as AuthErrorLike;
  return {
    name: typeof name === "string" ? name : "Unknown",
    status: typeof status === "number" ? status : null,
    code: typeof code === "string" ? code : null
  };
}

export function isSupabaseAuthCookieName(name: string) {
  return name.startsWith("sb-") && name.includes("-auth-token");
}
