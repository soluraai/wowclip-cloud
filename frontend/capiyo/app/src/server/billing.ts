// wowclip version of this file. Capiyo's original took payments for credits. wowclip has no payments; only the
// type that projects/api.ts names is kept, so that file can stay unchanged.

export type PaymentView = {
  id: string;
  status: string;
  amount: number;
  packs: number;
  credits: number;
  createdAt: number;
  paidAt?: number;
  method?: string;
  paymentId?: string;
  error?: string;
  refundedAmount?: number;
};
