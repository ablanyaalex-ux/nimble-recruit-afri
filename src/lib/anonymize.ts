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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactResumeText(
  text?: string | null,
  candidate?: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    linkedin_url?: string | null;
    location?: string | null;
  },
): string | null {
  if (!text) return text ?? null;

  let redacted = text;
  const replacements = [
    [candidate?.full_name, anonymizeName(candidate?.full_name)],
    [candidate?.email, "[email redacted]"],
    [candidate?.phone, "[phone redacted]"],
    [candidate?.linkedin_url, "[LinkedIn redacted]"],
    [candidate?.location, "[location redacted]"],
  ] as const;

  for (const [value, replacement] of replacements) {
    if (value?.trim()) {
      redacted = redacted.replace(new RegExp(escapeRegExp(value.trim()), "gi"), replacement);
    }
  }

  return redacted
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
    .replace(/(?:https?:\/\/|www\.)\S+/gi, "[link redacted]")
    .replace(/\b(?:linkedin\.com\/in\/|linkedin profile|linkedin)\S*[^\n]*/gi, "[LinkedIn redacted]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[phone redacted]")
    .replace(/^\s*(?:age|date of birth|dob|birth date|born)\s*[:\-].*$/gim, "[age/date of birth redacted]")
    .replace(/^\s*(?:marital status|civil status|spouse|children|family status)\s*[:\-].*$/gim, "[marital/family status redacted]")
    .replace(/^\s*(?:gender|sex|pronouns|nationality|citizenship|address)\s*[:\-].*$/gim, "[personal identifier redacted]")
    .replace(/\*\*\s*Education\s*\*\*[\s\S]*?(?=\n\s*\*\*|$)/gi, "**Education**\n[education details redacted]")
    .trim();
}

// Strips a "**Education**" markdown section from an AI-generated resume summary
// so it isn't shown to hiring managers when the candidate is anonymised.
export function stripEducationSection(summary?: string | null): string | null {
  if (!summary) return summary ?? null;
  // Remove from a heading like "**Education**" up to the next bold heading or end.
  return redactResumeText(summary)?.replace(/\*\*\s*Education\s*\*\*\s*\n?\[education details redacted\]/gi, "").trim() ?? null;
}
