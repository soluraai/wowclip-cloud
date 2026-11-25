/** Where the app sends people outside itself. NEXT_PUBLIC_SITE_URL points at the marketing site (capiyo.in). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.NODE_ENV === "development" ? "http://localhost:4321" : "https://capiyo.in")).replace(/\/$/, "");
export const PRICING_URL = `${SITE_URL}/pricing`;
/** Every "Buy credits" in the app opens the in-app checkout on Billing. */
export const BUY_URL = "/billing?buy=1";
export const GUIDES_URL = `${SITE_URL}/guides`;
export const SUPPORT_EMAIL = "founder@capiyo.in";
export const supportMail = (subject = "Help with Capiyo") => `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;

/**
 * A small "signed in" cookie the marketing site reads to swap "Try it free" for "Dashboard".
 * It holds no account data, only "1". On capiyo.in it's shared with every subdomain; on localhost cookies
 * ignore the port, so the landing dev server sees it too.
 */
const SIGNED_IN_COOKIE = "capiyo_signed_in";
export function markSignedIn(on: boolean) {
  if (typeof document === "undefined") return;
  const host = window.location.hostname;
  const domain = host === "capiyo.in" || host.endsWith(".capiyo.in") ? "; domain=.capiyo.in" : "";
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = on
    ? `${SIGNED_IN_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax${domain}${secure}`
    : `${SIGNED_IN_COOKIE}=; path=/; max-age=0; samesite=lax${domain}${secure}`;
}
