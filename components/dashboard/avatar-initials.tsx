/** No avatar_url exists in the schema — every avatar in the app is initials-only. */
export function initialsFor(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function AvatarInitials({
  fullName,
  size = 26,
  className = "",
}: {
  fullName: string;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={`display flex shrink-0 items-center justify-center bg-paper-2 text-ink ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initialsFor(fullName) || "U"}
    </div>
  );
}
