/**
 * Allow only same-origin relative paths for post-auth redirects.
 * Rejects protocol-relative URLs, userinfo tricks, backslashes, and externals.
 */
export function safeAuthRedirectPath(
  next: string | null | undefined,
  fallback = "/"
): string {
  if (!next) return fallback;

  const value = next.trim();
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\") || value.includes("@")) return fallback;
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(value)) return fallback;

  return value;
}
