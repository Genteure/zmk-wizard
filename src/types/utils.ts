import { z } from "astro/zod";
import { isValid as isValidUlid } from "ulidx";

// ULID is 26 chars Crockford base32 (no I, L, O, U)
export const UlidSchema = z.string()
  .length(26, "ULID must be 26 characters long")
  .refine((value) => isValidUlid(value), "ULID must be a valid ULID");

export const DeviceIdSchema = UlidSchema.brand<"DeviceId", "inout">();
export type DeviceId = z.infer<typeof DeviceIdSchema>;
