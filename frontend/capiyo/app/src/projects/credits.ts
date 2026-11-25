import { renderFlagOf } from "../remotion/renderFlags";

/**
 * Credit rules, shared by the app and the server. One credit is one second of video (₹29 buys 900).
 *   Captions (listening + the key-word AI)   60 credits a minute (1 a second); the first export is included
 *   Each later export with changes            what that template really costs us to render, plus a margin
 *                                             (exportRate below); the same export again is free: it is reused
 *   Translations                              the first FREE_TRANSLATIONS languages of a project are included,
 *                                             later ones cost TRANSLATE_RATE a minute (a little over what they cost us)
 * Every charge is rounded up to a whole credit.
 */
export const FREE_CREDITS = 180;
export const FREE_TRANSLATIONS = 3;
export const TRANSLATE_RATE = 6;
export const CAPTION_RATE = 60;

/** The one pack on sale (landing/src/site.ts PRICE says the same). */
export const PACK = { name: "Creator Pack", rupees: 29, credits: 900 };

/** What one credit sells for (₹29 for 900). */
export const RUPEES_PER_CREDIT = 29 / 900;
/** Covers GST (18%), payment fees and a margin over the measured AWS cost. */
const EXPORT_MARKUP = 1.6;
/** A template that was never measured is priced like the heaviest ones. */
const UNMEASURED_INR = 1.2;

/**
 * Credits a minute for re-exporting with `styleId`: its measured Lambda cost of one minute (renderFlags `inr`,
 * from the AWS load test) times the markup, in credits. Light templates come to about 19 a minute, heavy ones 55–60.
 */
export const exportRate = (styleId: string) =>
  ((renderFlagOf(styleId).inr ?? UNMEASURED_INR) * EXPORT_MARKUP) / RUPEES_PER_CREDIT;

/** Rounds to a hundredth, so sums never drift (0.1 + 0.2). */
export const hundredths = (value: number) => Math.round(value * 100) / 100;

/** Credits for `seconds` of video at `rate` credits a minute, rounded up to a whole credit (at least 1). */
export const creditsFor = (seconds: number, rate = CAPTION_RATE) =>
  Math.max(1, Math.ceil(hundredths((Math.max(0, seconds) / 60) * rate) - 1e-9));

/** Balances saved before credits became seconds were minutes; they read (and are saved back) as seconds. */
export const CREDIT_UNIT = "second";
export const balanceOf = (data: { credits?: unknown; creditUnit?: unknown } | undefined) => {
  const value = Number(data?.credits) || 0;
  return data?.creditUnit === CREDIT_UNIT ? value : Math.round(value * 60);
};
/** The fields to write a balance with, so it's never converted twice. */
export const balanceFields = (credits: number) => ({ credits: hundredths(credits), creditUnit: CREDIT_UNIT });

/** Credits last 12 months from the day they are given (free, bought or given back). */
export const CREDIT_VALID_MS = 365 * 24 * 3600 * 1000;

/**
 * Credits come in lots, each with its own expiry. Spending takes from the lot that runs out first.
 *   free      the free credits of a new account
 *   pack      a bought pack
 *   carried   a balance from before lots existed (counted from the day it was carried over)
 *   refund    credits given back when no lot was left to put them in
 */
export type CreditLot = { id: string; kind: "free" | "pack" | "carried" | "refund" | "gift"; amount: number; left: number; at: number; expiresAt: number };
export type Wallet = { lots: CreditLot[]; balance: number };

const toMs = (value: unknown) =>
  typeof value === "number" ? value
    : value && typeof (value as { toMillis?: () => number }).toMillis === "function" ? (value as { toMillis: () => number }).toMillis()
      : undefined;

/** The live lots of an account (not run out, not expired) and what they add up to. */
export function walletOf(data: { credits?: unknown; creditUnit?: unknown; lots?: unknown; createdAt?: unknown } | undefined, now = Date.now()): Wallet {
  let lots: CreditLot[];
  if (Array.isArray(data?.lots)) lots = data.lots as CreditLot[];
  else {
    // An account from before lots: its whole balance becomes one lot that lasts 12 months from now.
    const total = balanceOf(data);
    lots = total > 0 ? [{ id: "carried", kind: "carried", amount: total, left: total, at: toMs(data?.createdAt) ?? now, expiresAt: now + CREDIT_VALID_MS }] : [];
  }
  const balance = hundredths(lots.filter((lot) => lot.expiresAt > now && lot.left > 0).reduce((sum, lot) => sum + lot.left, 0));
  return { lots, balance };
}

/** Takes `cost` from the lots that expire first. Returns the new lots, or null when there isn't enough. */
export function takeFrom(lots: CreditLot[], cost: number, now = Date.now()): CreditLot[] | null {
  let owed = hundredths(cost);
  const next = lots.map((lot) => ({ ...lot }));
  for (const lot of [...next].filter((item) => item.expiresAt > now && item.left > 0).sort((a, b) => a.expiresAt - b.expiresAt)) {
    if (owed <= 1e-9) break;
    const used = Math.min(lot.left, owed);
    lot.left = hundredths(lot.left - used);
    owed = hundredths(owed - used);
  }
  return owed > 1e-9 ? null : next;
}

/**
 * Takes back up to `amount` (a refunded or charged-back payment): first from the lot `preferId` (the pack that payment
 * bought), then from the other live lots, those that expire first first. Never goes below zero: `taken` says how much
 * was really there.
 */
export function takeBack(lots: CreditLot[], amount: number, preferId?: string, now = Date.now()): { lots: CreditLot[]; taken: number } {
  let owed = hundredths(Math.max(0, amount));
  const next = lots.map((lot) => ({ ...lot }));
  const live = next.filter((lot) => lot.expiresAt > now && lot.left > 0)
    .sort((a, b) => Number(b.id === preferId) - Number(a.id === preferId) || a.expiresAt - b.expiresAt);
  for (const lot of live) {
    if (owed <= 1e-9) break;
    const used = Math.min(lot.left, owed);
    lot.left = hundredths(lot.left - used);
    owed = hundredths(owed - used);
  }
  return { lots: next, taken: hundredths(Math.max(0, amount) - owed) };
}

/** Puts credits back in the live lot that lasts longest, or a new 12-month lot when none is live. */
export function giveBack(lots: CreditLot[], amount: number, now = Date.now()): CreditLot[] {
  const next = lots.map((lot) => ({ ...lot }));
  const live = next.filter((lot) => lot.expiresAt > now).sort((a, b) => b.expiresAt - a.expiresAt)[0];
  if (live) live.left = hundredths(live.left + amount);
  else next.push({ id: `refund-${now}`, kind: "refund", amount, left: amount, at: now, expiresAt: now + CREDIT_VALID_MS });
  return next;
}

/** A new lot of credits (free credits, a bought pack). */
export const newLot = (kind: CreditLot["kind"], amount: number, now = Date.now()): CreditLot =>
  ({ id: `${kind}-${now}`, kind, amount, left: amount, at: now, expiresAt: now + CREDIT_VALID_MS });

/** The fields to save lots with: the lots, plus their live total as `credits` for quick reads. Lots long gone are dropped. */
export const walletFields = (lots: CreditLot[], now = Date.now()) => {
  // Kept a year past their expiry, so the usage page can still show them.
  const kept = lots.filter((lot) => lot.expiresAt > now - CREDIT_VALID_MS);
  return { lots: kept, ...balanceFields(walletOf({ lots: kept }, now).balance) };
};

/** One line of the usage history. `amount` is negative for credits spent. */
export type UsageEntry = {
  id: string;
  at: number;
  /** "refund" is credits given back to the user; "reversal" is a bought pack taken back after its payment was refunded or charged back. */
  kind: "free" | "pack" | "captions" | "export" | "translate" | "refund" | "gift" | "reversal";
  amount: number;
  balance: number;
  title?: string;
  projectId?: string;
  seconds?: number;
};

/** "900", "12.5": whole numbers plain. */
export const formatCredits = (value: number) => {
  const rounded = hundredths(value);
  return Number.isInteger(rounded) ? rounded.toLocaleString("en-IN") : String(rounded);
};

/** "1 credit", "60 credits". */
export const creditLabel = (value: number) => `${formatCredits(value)} credit${hundredths(value) === 1 ? "" : "s"}`;

/** "45 seconds", "1,038 seconds": how much video a balance covers. Always in seconds, never minutes (it reads bigger). */
export const creditTime = (value: number) => {
  const seconds = Math.max(0, Math.floor(value));
  return `${seconds.toLocaleString("en-IN")} second${seconds === 1 ? "" : "s"}`;
};
