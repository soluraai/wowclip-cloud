// wowclip version of this file. Capiyo's original was a server route that read the user's credits from Firestore.
// wowclip has no credits; only the type that projects/api.ts names is kept, so that file can stay unchanged.

import type { CreditLot, UsageEntry } from "../../../projects/credits";

export type Usage = { balance: number; lots: CreditLot[]; history: UsageEntry[] };
