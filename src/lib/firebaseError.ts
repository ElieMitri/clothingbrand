const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  // Auth
  "auth/email-already-in-use":
    "This email is already registered. Try signing in instead.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/weak-password":
    "Password is too weak. Use at least 6 characters.",
  "auth/user-not-found": "Incorrect email or password.",
  "auth/wrong-password": "Incorrect email or password.",
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/too-many-requests":
    "Too many attempts. Please wait a bit and try again.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/network-request-failed":
    "Network error. Check your internet connection and try again.",
  "auth/popup-closed-by-user":
    "The sign-in popup was closed before completion.",
  "auth/popup-blocked":
    "Your browser blocked the sign-in popup. Please allow popups and try again.",
  "auth/cancelled-popup-request":
    "Another sign-in request is already in progress.",
  "auth/account-exists-with-different-credential":
    "An account already exists with this email using a different sign-in method.",
  "auth/credential-already-in-use":
    "This credential is already linked to another account.",
  "auth/requires-recent-login":
    "For security, please sign in again and retry this action.",
  "auth/operation-not-allowed":
    "This sign-in method is currently unavailable.",

  // Firestore / Core
  "permission-denied":
    "You do not have permission to perform this action.",
  "not-found": "The requested data could not be found.",
  "already-exists": "This item already exists.",
  "failed-precondition":
    "This action cannot be completed right now. Please try again.",
  "aborted": "The operation was interrupted. Please try again.",
  "cancelled": "The request was cancelled.",
  "unavailable": "Service is temporarily unavailable. Please try again.",
  "deadline-exceeded": "The request took too long. Please try again.",
  "resource-exhausted":
    "Request limit reached. Please wait a moment and retry.",
  "unauthenticated": "Please sign in and try again.",
  "invalid-argument": "Some provided information is invalid.",

  // Storage
  "storage/object-not-found": "The requested file could not be found.",
  "storage/unauthorized":
    "You do not have permission to access this file.",
  "storage/canceled": "File upload was cancelled.",
  "storage/retry-limit-exceeded":
    "Upload timed out. Please check your connection and try again.",
  "storage/invalid-checksum":
    "Upload failed due to file integrity check. Please try again.",
  "storage/quota-exceeded":
    "Storage quota exceeded. Please contact support.",
};

const getFirebaseErrorCode = (error: unknown): string | null => {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }

  return null;
};

export const getFirebaseFriendlyError = (
  error: unknown,
  fallback: string
): string => {
  const code = getFirebaseErrorCode(error);

  if (code && FIREBASE_ERROR_MESSAGES[code]) {
    return FIREBASE_ERROR_MESSAGES[code];
  }

  if (error instanceof Error) {
    // Hide raw Firebase internals for unknown SDK errors.
    if (
      error.message.includes("Firebase:") ||
      error.message.includes("auth/") ||
      error.message.includes("permission-denied")
    ) {
      return fallback;
    }
    return error.message;
  }

  return fallback;
};
