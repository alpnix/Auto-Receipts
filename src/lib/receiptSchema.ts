import { z } from "zod";

const num = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : v))
  .refine((v) => Number.isFinite(v), "Expected a finite number");

export const ReceiptSchema = z
  .object({
    document_type: z.enum(["receipt", "invoice", "other"]).default("receipt"),

    merchant: z
      .object({
        name: z.string().min(1),
        address: z.string().optional(),
        phone: z.string().optional(),
        website: z.string().optional(),
      })
      .optional(),

    transaction: z
      .object({
        date: z.string().optional(), // prefer ISO-8601: YYYY-MM-DD
        time: z.string().optional(), // HH:mm[:ss]
        receipt_number: z.string().optional(),
        payment_method: z.string().optional(),
        card_last4: z.string().optional(),
        currency: z.string().optional(), // ISO-4217 (e.g. USD)
      })
      .optional(),

    totals: z
      .object({
        subtotal: num.optional(),
        tax: num.optional(),
        tip: num.optional(),
        discount: num.optional(),
        total: num.optional(),
      })
      .optional(),

    line_items: z
      .array(
        z.object({
          description: z.string().min(1),
          quantity: num.optional(),
          unit_price: num.optional(),
          total_price: num.optional(),
        }),
      )
      .default([]),

    notes: z.array(z.string()).default([]),
  })
  .strict();

export type Receipt = z.infer<typeof ReceiptSchema>;


