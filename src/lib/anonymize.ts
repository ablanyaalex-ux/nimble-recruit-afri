// Helpers for redacting candidate details when shown to hiring managers in
// "anonymous review". We keep the first letter of the first and last name
// (e.g. "Jane Doe" -> "J. D.") and strip everything else identifiable.

export function anonymizeName(fullName?: string | null): string {
  if (!fullName) return "Anonymous";
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "Anonymous";
  const first = parts[0]?.[0]?.toUpperCase() ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0]?.toUpperCase() ?? "" : "";
  return last ? `${first}. ${last}.` : `${first}.`;
}

// Strips a "**Education**" markdown section from an AI-generated resume summary
// so it isn't shown to hiring managers when the candidate is anonymised.
export function stripEducationSection(summary?: string | null): string | null {
  if (!summary) return summary ?? null;
  // Remove from a heading like "**Education**" up to the next bold heading or end.
  return summary
    .replace(/\*\*\s*Education\s*\*\*[\s\S]*?(?=\n\s*\*\*|$)/gi, "")
    .trim();
}
