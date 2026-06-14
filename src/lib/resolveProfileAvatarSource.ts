/** Fusionne profiles.avatar_url et métadonnées JWT Auth. */
export function resolveProfileAvatarSource(
  profileAvatarUrl: string | null | undefined,
  userMetadata: Record<string, unknown> | null | undefined,
): string | null {
  const fromProfile = profileAvatarUrl?.trim();
  if (fromProfile) return fromProfile;
  for (const key of ["avatar_url", "user_photo_url", "picture", "photo_url"] as const) {
    const value = userMetadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
