/**
 * Pit Stop v2: Canonical Shared Types
 * Master interface definitions for the F1 Grand Prix Fan Concession Logistics Platform
 */

export type ConcessionCategory = 'food' | 'merch';
export type SubCategory = 'meal' | 'snack' | 'beverage' | 'apparel' | 'accessory';

export interface CatalogItem {
  id: string;
  name: string;
  category: ConcessionCategory;
  subCategory?: SubCategory;
  price: number;
  originalPrice?: number;
  image: string; // e.g. /images/burger.jpg
  prepTime: string;
  tag?: string;
  inStock: boolean;
  availableUnits: number;
  stock: number;
  isLimitedDrop?: boolean;
  description?: string;
  isAlcoholic?: boolean;
}

export type StationId = 'M1' | 'M2' | 'M3' | 'M4';
export type StationQueueStatus = 'FASTEST' | 'LOW QUEUE' | 'MODERATE' | 'HEAVY TRAFFIC';

export interface StationRecord {
  id: StationId | string;
  name: string;
  location: string;
  distance: string;
  walkTimeMins: number;
  queueTimeMins: number;
  status: StationQueueStatus;
  capacityPercent: number;
  coordinates?: { lat: number; lng: number };
}

export interface ViewingArea {
  grandstand: string;
  turn: string;
  seat: string;
  nearestGate: string;
  recommendedDropStation: string;
}

export interface TicketProfile {
  ticketCode: string;
  verified: boolean;
  holderName: string;
  ticketType: string;
  viewingArea: ViewingArea;
  loyaltyTier: string;
  loyaltyPoints: number;
}

export interface OrderItemRecord {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  sku?: string;
  image?: string;
}

export type OrderStatus = 'RECEIVED' | 'PREPARING' | 'READY_FOR_PICKUP' | 'COMPLETED';
export type PaymentStatus = 'PENDING' | 'PAID' | 'REFUNDED';

export interface OrderRecord {
  orderId: string; // Format: GP-2026-<6-character base36>
  pinCode: string; // 4-digit pickup PIN, e.g. "8291"
  customerId: string;
  ticketCode: string;
  isGroupOrder: boolean;
  seatNote?: string;
  items: OrderItemRecord[];
  subtotal: number;
  discountAmount: number;
  discountRate: string;
  voucherCode?: string;
  serviceFee: number;
  total: number;
  loyaltyPointsEarned: number;
  pickupStationId: string;
  pickupStationName: string;
  counterNumber: string;
  walkTimeMins: number;
  qrPayload: string;
  signatureBase64: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  ttl?: number; // Epoch seconds for DynamoDB TTL
}

export interface PricingBreakdown {
  subtotal: number;
  dynamicYieldDiscount: number;
  voucherDiscount: number;
  serviceFee: number;
  total: number;
  loyaltyPointsEarned: number;
  effectiveDiscountRate: string;
  freeItemApplied?: { itemId: string; name: string; originalPrice: number };
}

export type VoucherDiscountType = 'PERCENTAGE' | 'FIXED' | 'FREE_ITEM';

export interface VoucherRecord {
  code: string;
  title: string;
  description: string;
  discountType: VoucherDiscountType;
  value: number; // Percentage (e.g. 15 for 15%) or Fixed dollar (e.g. 10 for $10)
  freeItemId?: string;
  minOrder: number;
  pointsCost?: number;
  active: boolean;
  expiresAt?: string;
}

export interface BadgeRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  unlocked: boolean;
  unlockedAt?: string;
  icon?: string;
}

export interface RewardsHistoryItem {
  id: string;
  type: 'EARNED' | 'REDEEMED';
  description: string;
  points: number;
  timestamp: string;
  orderId?: string;
}

export interface RewardsState {
  ticketCode: string;
  holderName: string;
  points: number;
  tier: string;
  tierNextThreshold: number;
  badges: BadgeRecord[];
  vouchers: VoucherRecord[];
  history: RewardsHistoryItem[];
}

export interface PublicKeyResponse {
  keyId: string;
  publicKeyBase64: string;
  algorithm: 'Ed25519';
  format: 'spki-der-base64';
}

/**
 * Pit Stop v3: Live Race Control & Dynamic Circuit States
 */
export type CircuitFlag = 'GREEN_FLAG' | 'SAFETY_CAR' | 'RED_FLAG' | 'POST_RACE';

export interface CircuitState {
  flag: CircuitFlag;
  offPeakDiscountPct: number;
  queueMultiplier: number;
  message: string;
  updatedAt: string;
  updatedBy: string;
}

/**
 * Pit Stop v3: Smart Locker Bay Status
 */
export interface LockerBayStatus {
  bay: string; // e.g. "#01" .. "#08"
  stationId: string; // e.g. "M1" .. "M4"
  status: 'AVAILABLE' | 'OCCUPIED';
  orderId?: string;
  pinCode?: string;
  orderStatus?: string;
  updatedAt?: string;
}

/**
 * Pit Stop v3: Group Order Info
 */
export interface GroupOrderInfo {
  isGroupOrder: boolean;
  seatNote?: string;
  collectorName?: string;
}

/**
 * Pit Stop v3: Public Read-Only Order Tracking (Strict Zero-Secret Contract)
 * Explicitly DOES NOT contain qrPayload, signatureBase64, or pinCode
 */
export interface PublicOrderTracking {
  orderId: string;
  status: string;
  pickupStationId: string;
  pickupStationName: string;
  counterNumber: string;
  walkTimeMins: number;
  isGroupOrder: boolean;
  seatNote?: string;
  items: Array<{ name: string; quantity: number }>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Pit Stop v3: Offline Fulfillment Outbox Synchronization Action
 */
export interface OfflineSyncAction {
  id: string;
  orderId: string;
  status: 'PREPARING' | 'READY_FOR_PICKUP' | 'COMPLETED';
  nonce?: string;
  queuedAt: string;
  attempts: number;
  lastError?: string;
}

