/**
 * Addresses allowed to create an account. Students use @email.sc.edu (a few
 * older accounts are plain @sc.edu); Darla Moore School faculty use
 * @moore.sc.edu.
 */
export const ACCEPTED_EMAIL_DOMAINS = ["@email.sc.edu", "@sc.edu", "@moore.sc.edu"] as const;

export function isUscEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return ACCEPTED_EMAIL_DOMAINS.some((domain) => normalized.endsWith(domain));
}

/** Human-readable list for form hints and error copy. */
export const ACCEPTED_DOMAINS_LABEL = ACCEPTED_EMAIL_DOMAINS.join(", ");
