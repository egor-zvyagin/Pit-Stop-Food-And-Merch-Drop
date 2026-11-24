/**
 * Pit Stop v3: Zod Validation Schemas
 * Canonical request validation for all API endpoints.
 */
import { z } from 'zod';

// --- POST /api/orders ---
export const CreateOrderSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().optional(),
        id: z.string().optional(),
        sku: z.string().optional(),
        name: z.string().optional(),
        quantity: z.number().int().positive('Quantity must be a positive integer'),
        unitPrice: z.number().nonnegative().optional(),
        image: z.string().optional(),
        // Kitchen option IDs from the catalogue, e.g. ["no-pickles"].
        options: z.array(z.string().max(40)).max(8).optional(),
      })
    )
    .min(1, 'Order must contain at least one item'),
  pickupStationId: z.string().optional(),
  stationId: z.string().optional(), // alias used by existing clients
  ticketCode: z.string().optional(),
  promoCode: z.string().optional(),
  isGroupOrder: z.boolean().optional().default(false),
  seatNote: z.string().max(200).optional(),
  // Accepted for older clients but ignored: the server prices every order
  // at the race flag it holds, never at one the client claims.
  circuitStatus: z.string().optional(),
});
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

// --- PATCH /api/orders/[id]/status ---
export const UpdateOrderStatusSchema = z.object({
  status: z.preprocess(
    (val) => (val === 'COLLECTED' ? 'COMPLETED' : val),
    z.enum(['PREPARING', 'READY_FOR_PICKUP', 'COMPLETED'])
  ),
  pinCode: z.string().optional(),
});
export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;

// --- POST /api/payment/checkout ---
export const CheckoutSchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
  method: z
    .enum(['apple_pay', 'google_pay', 'credit_card', 'grand_prix_points'])
    .optional(),
  // keep paymentMethod as alias
  paymentMethod: z
    .enum(['apple_pay', 'google_pay', 'credit_card', 'grand_prix_points'])
    .optional(),
  amount: z.number().nonnegative('Amount must be non-negative'),
  currency: z.string().optional().default('AUD'),
  pointsRedeemed: z.number().int().nonnegative().optional().default(0),
  idempotencyKey: z.string().optional(),
  // The order's collection PIN: proves the caller owns the order being paid.
  pinCode: z.string().optional(),
});
export type CheckoutInput = z.infer<typeof CheckoutSchema>;

// --- POST /api/auth/verify-ticket ---
export const VerifyTicketSchema = z.object({
  ticketCode: z.string().min(1, 'ticketCode is required'),
});
export type VerifyTicketInput = z.infer<typeof VerifyTicketSchema>;

// --- PATCH /api/circuit/status ---
export const UpdateCircuitStatusSchema = z.object({
  flag: z.enum(['GREEN_FLAG', 'SAFETY_CAR', 'RED_FLAG', 'POST_RACE']),
  message: z.string().max(300).optional(),
});
export type UpdateCircuitStatusInput = z.infer<typeof UpdateCircuitStatusSchema>;

// --- POST /api/inventory/restock ---
export const InventoryRestockSchema = z.object({
  mode: z.enum(['restock_all', 'flash_drop']),
  itemId: z.string().optional(),
  stock: z.number().int().nonnegative().optional(),
});
export type InventoryRestockInput = z.infer<typeof InventoryRestockSchema>;
