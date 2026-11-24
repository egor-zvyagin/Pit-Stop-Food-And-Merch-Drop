import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  ScanCommand,
  QueryCommand,
  TransactWriteCommand,
  TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { CATALOG_ITEMS } from '@/data/catalog';
import { PIT_STOPS } from '@/data/pitStopConstantData';
import {
  CatalogItem,
  OrderRecord,
  OrderItemRecord,
  TicketProfile,
  StationRecord,
  RewardsState,
  VoucherRecord,
  BadgeRecord,
  RewardsHistoryItem,
  PaymentStatus,
  CircuitFlag,
  CircuitState,
  LockerBayStatus,
} from '@/lib/types';

export type CreateOrderInput = Omit<OrderRecord, 'serviceFee' | 'paymentStatus' | 'ttl'> & {
  serviceFee?: number;
  paymentStatus?: PaymentStatus;
  ttl?: number;
};

// Re-export canonical shared types for backwards compatibility
export type {
  CatalogItem,
  OrderRecord,
  OrderItemRecord,
  TicketProfile,
  StationRecord,
  RewardsState,
  VoucherRecord,
  BadgeRecord,
  RewardsHistoryItem,
  PaymentStatus,
  CircuitFlag,
  CircuitState,
  LockerBayStatus,
};

// In-Memory Fallback State
const inMemoryStore = {
  items: new Map<string, CatalogItem>(),
  orders: new Map<string, OrderRecord>(),
  stations: new Map<string, StationRecord>(),
  tickets: new Map<string, TicketProfile>(),
  ticketHistory: new Map<string, RewardsHistoryItem[]>(),
  awardedOrders: new Set<string>(),
  circuitState: null as CircuitState | null,
  initialized: false,
};

// --- Circuit Flag Rules ---
export const CIRCUIT_FLAG_RULES: Record<CircuitFlag, Omit<CircuitState, 'flag' | 'updatedAt' | 'updatedBy'>> = {
  GREEN_FLAG: {
    offPeakDiscountPct: 10,
    queueMultiplier: 1.0,
    message: 'Track Session Active \u2014 Off-Peak Pit Stop Savings Open',
  },
  SAFETY_CAR: {
    offPeakDiscountPct: 0,
    queueMultiplier: 1.6,
    message: 'Safety Car Deployed \u2014 Surge Concourse Traffic (Off-Peak Paused)',
  },
  RED_FLAG: {
    offPeakDiscountPct: 0,
    queueMultiplier: 2.0,
    message: 'Red Flag Halt \u2014 Peak Concourse Surge',
  },
  POST_RACE: {
    offPeakDiscountPct: 15,
    queueMultiplier: 1.2,
    message: 'Checkered Flag \u2014 Post-Race Merch Drop Deals Active',
  },
};

/**
 * Error thrown when an atomic order creation fails due to insufficient stock.
 * Carries available stock per SKU for a 409 response.
 */
export class InsufficientStockError extends Error {
  public readonly availableStock: Record<string, number>;

  constructor(availableStock: Record<string, number>) {
    super('Insufficient stock for one or more items in the order');
    this.name = 'InsufficientStockError';
    this.availableStock = availableStock;
  }
}

function initInMemoryDefaults() {
  if (inMemoryStore.initialized) return;

  CATALOG_ITEMS.forEach((item) => {
    inMemoryStore.items.set(item.id, item);
  });

  PIT_STOPS.forEach((stop) => {
    inMemoryStore.stations.set(stop.id, {
      id: stop.id,
      name: stop.name,
      location: stop.distance,
      distance: stop.distance,
      walkTimeMins: stop.id === 'M1' ? 1 : stop.id === 'M2' ? 2 : stop.id === 'M3' ? 5 : 20,
      queueTimeMins: stop.status === 'FASTEST' ? 2 : stop.status === 'LOW QUEUE' ? 3 : 15,
      status: stop.status,
      capacityPercent: stop.status === 'FASTEST' ? 25 : stop.status === 'LOW QUEUE' ? 40 : 85,
      coordinates: { lat: stop.latitude, lng: stop.longitude },
    });
  });

  inMemoryStore.tickets.set('GP-3820-X', {
    ticketCode: 'GP-3820-X',
    verified: true,
    holderName: 'Egor Zvyagin',
    ticketType: '4-Day Grandstand Pass',
    viewingArea: {
      grandstand: 'Clark Grandstand',
      turn: 'Turn 9',
      seat: 'Row H, Seat 14',
      nearestGate: 'Gate 3 (Canterbury Rd)',
      recommendedDropStation: 'M2',
    },
    loyaltyTier: 'VIP Fan',
    loyaltyPoints: 1850,
  });

  inMemoryStore.tickets.set('GP-9014-P', {
    ticketCode: 'GP-9014-P',
    verified: true,
    holderName: 'Grand Prix Fan',
    ticketType: '3-Day General Admission',
    viewingArea: {
      grandstand: 'Brabham Grandstand',
      turn: 'Turn 1 & 2',
      seat: 'Unreserved Lawn',
      nearestGate: 'Gate 1',
      recommendedDropStation: 'M3',
    },
    loyaltyTier: 'Race Fan',
    loyaltyPoints: 650,
  });

  inMemoryStore.orders.set('GP-2026-X9K2P4', {
    orderId: 'GP-2026-X9K2P4',
    pinCode: '8821',
    customerId: 'TICKET#GP-3820-X',
    ticketCode: 'GP-3820-X',
    isGroupOrder: true,
    seatNote: 'Clark Stand Row H, Seats 14-16',
    items: [
      { itemId: 'apex-burger', name: 'APEX BURGER', quantity: 2, unitPrice: 16.5 },
      { itemId: 'craft-lager', name: 'CRAFT LAGER 4-PACK', quantity: 1, unitPrice: 36.0 },
      { itemId: 'loaded-fries', name: 'TRACKSIDE LOADED FRIES', quantity: 2, unitPrice: 12.0 },
    ],
    subtotal: 93.0,
    discountAmount: 9.3,
    discountRate: '10% OFF',
    serviceFee: 2.09,
    total: 85.79,
    loyaltyPointsEarned: 172,
    pickupStationId: 'M2',
    pickupStationName: 'PIT STOP M2',
    counterNumber: '#04',
    walkTimeMins: 2,
    qrPayload: 'AGPC1.AGPC-2027-KEY-01.SAMPLE.GP-2026-X9K2P4',
    signatureBase64: 'sampleSigBase64==',
    status: 'READY_FOR_PICKUP',
    paymentStatus: 'PAID',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  inMemoryStore.initialized = true;
}

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'pitstop_data';
const REGION = process.env.AWS_REGION || 'ap-southeast-2';

/**
 * Raised when DynamoDB is the configured store and a call to it fails.
 *
 * The in-memory store below exists for local development and tests
 * (USE_LOCAL_STORAGE=true). It is never a fallback for a failing database:
 * answering with made-up data, or "creating" an order that only exists in
 * one server process, is worse than an honest error.
 */
export class DatabaseUnavailableError extends Error {
  readonly operation: string;

  constructor(operation: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.name : 'unknown error';
    super(`Database unavailable during ${operation} (${detail})`);
    this.name = 'DatabaseUnavailableError';
    this.operation = operation;
  }
}

function dbFailure(operation: string, err: unknown): never {
  console.error(`DynamoDB ${operation} failed:`, err);
  throw new DatabaseUnavailableError(operation, err);
}

let cachedDocClient: DynamoDBDocumentClient | null = null;
let clientInitialized = false;

export function getDocClient(): DynamoDBDocumentClient | null {
  if (process.env.USE_LOCAL_STORAGE === 'true') {
    return null;
  }
  if (clientInitialized) {
    return cachedDocClient;
  }

  try {
    // Uses the AWS SDK v3 default credential provider chain:
    // Automatically resolves IAM role credentials via Amplify SSR Compute Role in production,
    // or local AWS credentials / profile during development.
    const rawClient = new DynamoDBClient({ region: REGION });
    cachedDocClient = DynamoDBDocumentClient.from(rawClient);
    clientInitialized = true;
    return cachedDocClient;
  } catch (err) {
    return dbFailure('client initialisation', err);
  }
}

// Ensure in-memory defaults are loaded
initInMemoryDefaults();

// Canonical vouchers catalog for rewards
const REWARDS_VOUCHERS_CATALOG: VoucherRecord[] = [
  {
    code: 'PITSTOP15',
    title: '15% Green-Flag Discount',
    description: '-15% Off Trackside Concessions',
    discountType: 'PERCENTAGE',
    value: 15,
    minOrder: 0,
    pointsCost: 0,
    active: true,
  },
  {
    code: 'GP-BREW01',
    title: 'Free Cold Brew / Water',
    description: 'Complimentary drink on next order',
    discountType: 'FREE_ITEM',
    value: 6.5,
    freeItemId: 'still-water',
    minOrder: 0,
    pointsCost: 500,
    active: true,
  },
  {
    code: 'FREE-FRIES',
    title: 'Free Fries Upgrade',
    description: 'Complimentary High-Downforce Fries on next order',
    discountType: 'FREE_ITEM',
    value: 9.5,
    freeItemId: 'fries',
    minOrder: 0,
    pointsCost: 800,
    active: true,
  },
  {
    code: 'GP-SAVE05',
    title: '$5.00 Off Voucher',
    description: '$5 discount applied at checkout',
    discountType: 'FIXED',
    value: 5,
    minOrder: 15,
    pointsCost: 1000,
    active: true,
  },
  {
    code: 'FREE-BURGER',
    title: 'Free Apex Burger',
    description: 'Complimentary Apex Burger on next order',
    discountType: 'FREE_ITEM',
    value: 16.5,
    freeItemId: 'apex-burger',
    minOrder: 20,
    pointsCost: 1500,
    active: true,
  },
  {
    code: 'GP-SAVE10',
    title: '$10.00 Off Voucher',
    description: '$10 discount applied at checkout',
    discountType: 'FIXED',
    value: 10,
    minOrder: 30,
    pointsCost: 1800,
    active: true,
  },
];

export const db = {
  get isUsingDynamoDB(): boolean {
    return Boolean(getDocClient());
  },

  // --- CONCESSION ITEMS ---
  async saveItem(item: CatalogItem): Promise<void> {
    const fullItem: CatalogItem = {
      ...item,
      stock: item.stock ?? item.availableUnits ?? 50,
      availableUnits: item.stock ?? item.availableUnits ?? 50,
      isLimitedDrop: item.isLimitedDrop ?? false,
    };
    const client = getDocClient();
    if (client) {
      try {
        await client.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              PK: `ITEM#${fullItem.id}`,
              SK: 'METADATA',
              ...fullItem,
            },
          })
        );
      } catch (err) {
        dbFailure('saveItem', err);
      }
    }
    inMemoryStore.items.set(fullItem.id, fullItem);
  },

  async getItems(): Promise<CatalogItem[]> {
    const client = getDocClient();
    if (client) {
      try {
        const result = await client.send(
          new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: 'begins_with(PK, :prefix) AND SK = :sk',
            ExpressionAttributeValues: {
              ':prefix': 'ITEM#',
              ':sk': 'METADATA',
            },
          })
        );
        if (result.Items && result.Items.length > 0) {
          return result.Items as CatalogItem[];
        }
      } catch (err) {
        dbFailure('getItems', err);
      }
    }
    return Array.from(inMemoryStore.items.values());
  },

  async getItemById(id: string): Promise<CatalogItem | undefined> {
    const client = getDocClient();
    if (client) {
      try {
        const result = await client.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `ITEM#${id}`, SK: 'METADATA' },
          })
        );
        if (result.Item) return result.Item as CatalogItem;
      } catch (err) {
        dbFailure('getItemById', err);
      }
    }
    return inMemoryStore.items.get(id);
  },

  // --- ORDERS ---
  async createOrder(order: CreateOrderInput): Promise<OrderRecord> {
    const ttl = order.ttl || Math.floor(Date.now() / 1000) + 7 * 86400; // 7-day DynamoDB TTL
    const paymentStatus = order.paymentStatus || 'PENDING';
    const serviceFee = order.serviceFee ?? 0;

    const fullOrder: OrderRecord = {
      ...order,
      serviceFee,
      ttl,
      paymentStatus,
    };

    const client = getDocClient();
    if (client) {
      try {
        await client.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              PK: `ORDER#${fullOrder.orderId}`,
              SK: 'METADATA',
              GSI1PK: `TICKET#${fullOrder.ticketCode}`,
              GSI1SK: `ORDER#${fullOrder.orderId}`,
              GSI2PK: `PIN#${fullOrder.pinCode}`,
              GSI2SK: `ORDER#${fullOrder.orderId}`,
              ...fullOrder,
            },
          })
        );
      } catch (err) {
        dbFailure('createOrder', err);
      }
    }
    inMemoryStore.orders.set(fullOrder.orderId, fullOrder);
    return fullOrder;
  },

  async getOrderById(orderId: string): Promise<OrderRecord | undefined> {
    const cleanId = orderId.toUpperCase();

    // With DynamoDB configured it is the only source of truth: a copy held in
    // this server process goes stale as soon as another instance updates the
    // order.
    const client = getDocClient();
    if (client) {
      try {
        const result = await client.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `ORDER#${cleanId}`, SK: 'METADATA' },
            ConsistentRead: true,
          })
        );
        return result.Item as OrderRecord | undefined;
      } catch (err) {
        dbFailure('getOrderById', err);
      }
    }
    return inMemoryStore.orders.get(cleanId);
  },

  async getOrderByPin(pinCode: string): Promise<OrderRecord | undefined> {
    const client = getDocClient();

    // Local mode: search the in-memory store
    if (!client) {
      for (const order of Array.from(inMemoryStore.orders.values())) {
        if (order.pinCode === pinCode) {
          return order;
        }
      }
      return undefined;
    }

    // DynamoDB GSI2 Query (GSI2PK = PIN#<pinCode>) with scan fallback
    if (client) {
      try {
        const result = await client.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: 'GSI2',
            KeyConditionExpression: 'GSI2PK = :pinPk',
            ExpressionAttributeValues: {
              ':pinPk': `PIN#${pinCode}`,
            },
          })
        );
        if (result.Items && result.Items.length > 0) {
          return result.Items[0] as OrderRecord;
        }
      } catch (gsiErr) {
        console.warn('GSI2 query failed, falling back to ScanCommand:', gsiErr);
        try {
          const scanResult = await client.send(
            new ScanCommand({
              TableName: TABLE_NAME,
              FilterExpression: 'pinCode = :pin AND begins_with(PK, :prefix)',
              ExpressionAttributeValues: {
                ':pin': pinCode,
                ':prefix': 'ORDER#',
              },
            })
          );
          if (scanResult.Items && scanResult.Items.length > 0) {
            return scanResult.Items[0] as OrderRecord;
          }
        } catch (scanErr) {
          dbFailure('getOrderByPin', scanErr);
        }
      }
    }
    return undefined;
  },

  async updateOrderStatus(
    orderId: string,
    status: OrderRecord['status']
  ): Promise<OrderRecord | undefined> {
    const cleanId = orderId.toUpperCase();
    const existing = inMemoryStore.orders.get(cleanId);
    const updatedTimestamp = new Date().toISOString();

    if (existing) {
      existing.status = status;
      existing.updatedAt = updatedTimestamp;
      inMemoryStore.orders.set(cleanId, existing);
    }

    const client = getDocClient();
    if (client) {
      try {
        await client.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `ORDER#${cleanId}`, SK: 'METADATA' },
            UpdateExpression: 'SET #st = :status, updatedAt = :updatedAt',
            ExpressionAttributeNames: { '#st': 'status' },
            ExpressionAttributeValues: {
              ':status': status,
              ':updatedAt': updatedTimestamp,
            },
          })
        );
      } catch (err) {
        dbFailure('updateOrderStatus', err);
      }
    }

    // In DynamoDB mode return the stored record, not this process's copy
    return client ? this.getOrderById(cleanId) : existing;
  },

  async updateOrderPaymentStatus(
    orderId: string,
    paymentStatus: PaymentStatus
  ): Promise<OrderRecord | undefined> {
    const cleanId = orderId.toUpperCase();
    const existing = inMemoryStore.orders.get(cleanId);
    const updatedTimestamp = new Date().toISOString();

    if (existing) {
      existing.paymentStatus = paymentStatus;
      existing.updatedAt = updatedTimestamp;
      inMemoryStore.orders.set(cleanId, existing);
    }

    const client = getDocClient();
    if (client) {
      try {
        await client.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: `ORDER#${cleanId}`, SK: 'METADATA' },
            UpdateExpression: 'SET paymentStatus = :ps, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
              ':ps': paymentStatus,
              ':updatedAt': updatedTimestamp,
            },
          })
        );
      } catch (err) {
        dbFailure('updateOrderPaymentStatus', err);
      }
    }

    // In DynamoDB mode return the stored record, not this process's copy
    return client ? this.getOrderById(cleanId) : existing;
  },

  async getAllOrders(): Promise<OrderRecord[]> {
    const client = getDocClient();
    if (client) {
      try {
        const result = await client.send(
          new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: 'begins_with(PK, :prefix) AND SK = :sk',
            ExpressionAttributeValues: {
              ':prefix': 'ORDER#',
              ':sk': 'METADATA',
            },
          })
        );
        return (result.Items ?? []) as OrderRecord[];
      } catch (err) {
        dbFailure('getAllOrders', err);
      }
    }
    return Array.from(inMemoryStore.orders.values());
  },

  async getOrders(ticketCode?: string): Promise<OrderRecord[]> {
    if (ticketCode) {
      const cleanTicket = ticketCode.trim().toUpperCase();
      // Try GSI1 Query by ticketCode
      const client = getDocClient();
      if (client) {
        try {
          const result = await client.send(
            new QueryCommand({
              TableName: TABLE_NAME,
              IndexName: 'GSI1',
              KeyConditionExpression: 'GSI1PK = :tpk',
              ExpressionAttributeValues: {
                ':tpk': `TICKET#${cleanTicket}`,
              },
            })
          );
          return (result.Items ?? []) as OrderRecord[];
        } catch (err) {
          dbFailure('getOrders', err);
        }
      }

      // Filter in-memory
      const local = Array.from(inMemoryStore.orders.values()).filter(
        (o) => o.ticketCode.toUpperCase() === cleanTicket
      );
      // A ticket with no orders has no orders; it must not get everyone's.
      return local;
    }

    return this.getAllOrders();
  },

  // --- STATIONS ---
  async saveStation(station: StationRecord): Promise<void> {
    const client = getDocClient();
    if (client) {
      try {
        await client.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              PK: `STATION#${station.id}`,
              SK: 'METADATA',
              ...station,
            },
          })
        );
      } catch (err) {
        dbFailure('saveStation', err);
      }
    }
    inMemoryStore.stations.set(station.id, station);
  },

  async getStations(): Promise<StationRecord[]> {
    const client = getDocClient();
    if (client) {
      try {
        const result = await client.send(
          new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: 'begins_with(PK, :prefix) AND SK = :sk',
            ExpressionAttributeValues: {
              ':prefix': 'STATION#',
              ':sk': 'METADATA',
            },
          })
        );
        if (result.Items && result.Items.length > 0) {
          return result.Items as StationRecord[];
        }
      } catch (err) {
        dbFailure('getStations', err);
      }
    }
    return Array.from(inMemoryStore.stations.values());
  },

  // --- TICKETS ---
  async saveTicket(ticket: TicketProfile): Promise<void> {
    const client = getDocClient();
    if (client) {
      try {
        await client.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              PK: `TICKET#${ticket.ticketCode}`,
              SK: 'PROFILE',
              ...ticket,
            },
          })
        );
      } catch (err) {
        dbFailure('saveTicket', err);
      }
    }
    inMemoryStore.tickets.set(ticket.ticketCode, ticket);
  },

  async getTicket(ticketCode: string): Promise<TicketProfile | undefined> {
    const clean = ticketCode.trim().toUpperCase();
    const client = getDocClient();
    if (client) {
      try {
        const result = await client.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `TICKET#${clean}`, SK: 'PROFILE' },
          })
        );
        if (result.Item) return result.Item as TicketProfile;
      } catch (err) {
        dbFailure('getTicket', err);
      }
    }
    if (inMemoryStore.tickets.has(clean)) {
      return inMemoryStore.tickets.get(clean);
    }

    // Dynamic fallback for any Grand Prix ticket format
    if (clean.startsWith('GP-')) {
      const generated: TicketProfile = {
        ticketCode: clean,
        verified: true,
        holderName: 'Grand Prix Fan',
        ticketType: 'General Admission',
        viewingArea: {
          grandstand: 'Albert Park Green',
          turn: 'Turn 14',
          seat: 'Unreserved Lawn',
          nearestGate: 'Gate 1',
          recommendedDropStation: 'M4',
        },
        loyaltyTier: 'Race Fan',
        loyaltyPoints: 500,
      };
      inMemoryStore.tickets.set(clean, generated);
      return generated;
    }

    return undefined;
  },

  // --- REWARDS & LOYALTY ---
  async getRewardsState(ticketCode: string): Promise<RewardsState> {
    const ticket = await this.getTicket(ticketCode);
    const points = ticket?.loyaltyPoints ?? 500;
    const holderName = ticket?.holderName ?? 'Grand Prix Fan';

    // Tier calculation
    let tier = 'Race Fan';
    let tierNextThreshold = 1000;
    if (points >= 2000) {
      tier = 'VIP Fan';
      tierNextThreshold = 5000;
    } else if (points >= 1000) {
      tier = 'Pit Lane Insider';
      tierNextThreshold = 2000;
    }

    // Badges calculation
    const badges: BadgeRecord[] = [
      {
        id: 'speedy-pickup',
        name: 'SPEEDY PICKUP',
        description: 'Picked up order in under 3 mins',
        category: 'efficiency',
        unlocked: points >= 500,
        unlockedAt: points >= 500 ? '2026-03-14T10:30:00Z' : undefined,
        icon: 'ph:lightning-fill',
      },
      {
        id: 'order-streak',
        name: 'ORDER STREAK',
        description: 'Complete 3 concession orders',
        category: 'streak',
        unlocked: points >= 1000,
        unlockedAt: points >= 1000 ? '2026-03-14T12:00:00Z' : undefined,
        icon: 'ph:fire-fill',
      },
      {
        id: 'big-spender',
        name: 'BIG SPENDER',
        description: 'Accumulate over $100 total spend',
        category: 'spend',
        unlocked: points >= 1500,
        unlockedAt: points >= 1500 ? '2026-03-14T14:15:00Z' : undefined,
        icon: 'ph:money-fill',
      },
      {
        id: 'vip-fan',
        name: 'VIP FAN',
        description: 'Reach 2,000 loyalty points',
        category: 'tier',
        unlocked: points >= 2000,
        unlockedAt: points >= 2000 ? '2026-03-14T15:00:00Z' : undefined,
        icon: 'ph:star-fill',
      },
    ];

    const history = inMemoryStore.ticketHistory.get(ticketCode.toUpperCase()) || [
      {
        id: 'HIST-INIT',
        type: 'EARNED',
        description: 'Grand Prix Welcome Bonus Points',
        points: points > 500 ? 500 : points,
        timestamp: '2026-03-14T08:00:00Z',
      },
    ];

    return {
      ticketCode: ticket?.ticketCode || ticketCode,
      holderName,
      points,
      tier,
      tierNextThreshold,
      badges,
      vouchers: REWARDS_VOUCHERS_CATALOG,
      history,
    };
  },

  async redeemReward(
    ticketCode: string,
    rewardId: string
  ): Promise<{
    success: boolean;
    error?: string;
    voucher?: VoucherRecord;
    remainingPoints?: number;
  }> {
    const cleanTicket = ticketCode.trim().toUpperCase();
    const ticket = await this.getTicket(cleanTicket);
    if (!ticket) {
      return { success: false, error: 'Ticket profile not found' };
    }

    // Match voucher by rewardId or voucher code
    const voucher = REWARDS_VOUCHERS_CATALOG.find(
      (v) =>
        v.code.toUpperCase() === rewardId.toUpperCase() ||
        v.title.toLowerCase().includes(rewardId.toLowerCase()) ||
        (rewardId === 'free-cold-brew' && v.code === 'GP-BREW01') ||
        (rewardId === 'free-fries' && v.code === 'FREE-FRIES') ||
        (rewardId === 'five-off' && v.code === 'GP-SAVE05') ||
        (rewardId === 'free-burger' && v.code === 'FREE-BURGER') ||
        (rewardId === 'ten-off' && v.code === 'GP-SAVE10')
    );

    if (!voucher) {
      return { success: false, error: `Reward '${rewardId}' not recognized` };
    }

    const cost = voucher.pointsCost || 0;
    if (ticket.loyaltyPoints < cost) {
      return {
        success: false,
        error: `Insufficient loyalty points (${ticket.loyaltyPoints} available, ${cost} required)`,
      };
    }

    // Deduct points
    ticket.loyaltyPoints -= cost;

    // Record history
    const historyEntry: RewardsHistoryItem = {
      id: `HIST-${Date.now()}`,
      type: 'REDEEMED',
      description: `Redeemed ${voucher.title} (${voucher.code})`,
      points: -cost,
      timestamp: new Date().toISOString(),
    };

    const currentHistory = inMemoryStore.ticketHistory.get(cleanTicket) || [];
    currentHistory.unshift(historyEntry);
    inMemoryStore.ticketHistory.set(cleanTicket, currentHistory);

    await this.saveTicket(ticket);

    return {
      success: true,
      voucher,
      remainingPoints: ticket.loyaltyPoints,
    };
  },

  async awardTicketPoints(
    ticketCode: string,
    points: number,
    orderId: string
  ): Promise<{ success: boolean; pointsAwarded: number; newTotal: number }> {
    const cleanTicket = ticketCode.trim().toUpperCase();
    const dedupeKey = `${cleanTicket}#${orderId}`;

    const ticket = await this.getTicket(cleanTicket);
    if (!ticket) {
      return { success: false, pointsAwarded: 0, newTotal: 0 };
    }

    // Idempotency check: don't award twice for the same orderId
    if (inMemoryStore.awardedOrders.has(dedupeKey)) {
      return {
        success: true,
        pointsAwarded: 0,
        newTotal: ticket.loyaltyPoints,
      };
    }

    inMemoryStore.awardedOrders.add(dedupeKey);
    ticket.loyaltyPoints += points;

    // Tier advancement
    if (ticket.loyaltyPoints >= 2000) {
      ticket.loyaltyTier = 'VIP Fan';
    } else if (ticket.loyaltyPoints >= 1000) {
      ticket.loyaltyTier = 'Pit Lane Insider';
    }

    // Record history
    const historyEntry: RewardsHistoryItem = {
      id: `HIST-${Date.now()}`,
      type: 'EARNED',
      description: `Order ${orderId} Concession Points`,
      points,
      timestamp: new Date().toISOString(),
      orderId,
    };

    const currentHistory = inMemoryStore.ticketHistory.get(cleanTicket) || [];
    currentHistory.unshift(historyEntry);
    inMemoryStore.ticketHistory.set(cleanTicket, currentHistory);

    await this.saveTicket(ticket);

    return {
      success: true,
      pointsAwarded: points,
      newTotal: ticket.loyaltyPoints,
    };
  },

  // --- ATOMIC ORDER CREATION (TransactWriteItems) ---
  async createOrderAtomic(
    order: CreateOrderInput,
    itemQuantities: Record<string, number>
  ): Promise<OrderRecord> {
    const ttl = order.ttl || Math.floor(Date.now() / 1000) + 7 * 86400;
    const paymentStatus = order.paymentStatus || 'PENDING';
    const serviceFee = order.serviceFee ?? 0;

    const fullOrder: OrderRecord = {
      ...order,
      serviceFee,
      ttl,
      paymentStatus,
    };

    const client = getDocClient();

    if (client) {
      // Build TransactWriteItems: one UpdateItem per SKU + one PutItem for the order
      const transactItems: NonNullable<TransactWriteCommandInput['TransactItems']> = [];

      for (const [itemId, qty] of Object.entries(itemQuantities)) {
        transactItems.push({
          Update: {
            TableName: TABLE_NAME,
            Key: { PK: `ITEM#${itemId}`, SK: 'METADATA' },
            UpdateExpression: 'SET stock = stock - :qty',
            ConditionExpression: 'attribute_exists(PK) AND stock >= :qty',
            ExpressionAttributeValues: { ':qty': qty },
          },
        });
      }

      transactItems.push({
        Put: {
          TableName: TABLE_NAME,
          Item: {
            PK: `ORDER#${fullOrder.orderId}`,
            SK: 'METADATA',
            GSI1PK: `TICKET#${fullOrder.ticketCode}`,
            GSI1SK: `ORDER#${fullOrder.orderId}`,
            GSI2PK: `PIN#${fullOrder.pinCode}`,
            GSI2SK: `ORDER#${fullOrder.orderId}`,
            ...fullOrder,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      });

      try {
        await client.send(new TransactWriteCommand({ TransactItems: transactItems }));
        inMemoryStore.orders.set(fullOrder.orderId, fullOrder);
        // Mirror stock decrements locally too
        for (const [itemId, qty] of Object.entries(itemQuantities)) {
          const local = inMemoryStore.items.get(itemId);
          if (local) {
            local.stock = Math.max(0, (local.stock ?? 0) - qty);
            local.availableUnits = local.stock;
            inMemoryStore.items.set(itemId, local);
          }
        }
        return fullOrder;
      } catch (err: unknown) {
        // TransactionCanceledException means a condition failed — check stock
        const isStockFailure =
          err instanceof Error &&
          (err.name === 'TransactionCanceledException' ||
            err.message.includes('ConditionalCheckFailed') ||
            err.message.includes('TransactionCanceledException'));

        if (isStockFailure) {
          // Build an availableStock map from current DynamoDB state
          const availableStock: Record<string, number> = {};
          for (const itemId of Object.keys(itemQuantities)) {
            try {
              const res = await client.send(
                new GetCommand({
                  TableName: TABLE_NAME,
                  Key: { PK: `ITEM#${itemId}`, SK: 'METADATA' },
                })
              );
              availableStock[itemId] = (res.Item?.stock as number) ?? 0;
            } catch {
              availableStock[itemId] = 0;
            }
          }
          throw new InsufficientStockError(availableStock);
        }
        // Any other DynamoDB error: the order was not stored, so say so.
        dbFailure('createOrderAtomic', err);
      }
    }

    // --- In-memory atomic fallback ---
    // Check all stocks first; throw if any insufficient
    const insufficientItems: Record<string, number> = {};
    for (const [itemId, qty] of Object.entries(itemQuantities)) {
      const local = inMemoryStore.items.get(itemId);
      const available = local?.stock ?? 0;
      if (available < qty) {
        insufficientItems[itemId] = available;
      }
    }
    if (Object.keys(insufficientItems).length > 0) {
      throw new InsufficientStockError(insufficientItems);
    }

    // All stocks sufficient — decrement atomically and persist
    for (const [itemId, qty] of Object.entries(itemQuantities)) {
      const local = inMemoryStore.items.get(itemId);
      if (local) {
        local.stock = Math.max(0, local.stock - qty);
        local.availableUnits = local.stock;
        inMemoryStore.items.set(itemId, local);
      }
    }
    inMemoryStore.orders.set(fullOrder.orderId, fullOrder);
    return fullOrder;
  },

  // --- INVENTORY RESTOCK ---
  async restockInventory(
    mode: 'restock_all' | 'flash_drop',
    itemId?: string,
    stock?: number
  ): Promise<{ updated: string[]; errors: string[] }> {
    const updated: string[] = [];
    const errors: string[] = [];
    const client = getDocClient();

    if (mode === 'restock_all') {
      const items = Array.from(inMemoryStore.items.values());
      for (const item of items) {
        const newStock = stock ?? 50;
        item.stock = newStock;
        item.availableUnits = newStock;
        item.inStock = true;
        inMemoryStore.items.set(item.id, item);
        if (client) {
          try {
            await client.send(
              new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { PK: `ITEM#${item.id}`, SK: 'METADATA' },
                UpdateExpression: 'SET stock = :s, availableUnits = :s, inStock = :t',
                ExpressionAttributeValues: { ':s': newStock, ':t': true },
              })
            );
          } catch (err) {
            errors.push(`DynamoDB update failed for ${item.id}: ${String(err)}`);
          }
        }
        updated.push(item.id);
      }
    } else if (mode === 'flash_drop' && itemId !== undefined) {
      const newStock = stock ?? 10;
      const existing = inMemoryStore.items.get(itemId);
      if (existing) {
        existing.stock = newStock;
        existing.availableUnits = newStock;
        existing.inStock = true;
        existing.isLimitedDrop = true;
        inMemoryStore.items.set(itemId, existing);
      }
      if (client) {
        try {
          await client.send(
            new UpdateCommand({
              TableName: TABLE_NAME,
              Key: { PK: `ITEM#${itemId}`, SK: 'METADATA' },
              UpdateExpression:
                'SET stock = :s, availableUnits = :s, inStock = :t, isLimitedDrop = :ld',
              ExpressionAttributeValues: { ':s': newStock, ':t': true, ':ld': true },
            })
          );
        } catch (err) {
          errors.push(`DynamoDB update failed for ${itemId}: ${String(err)}`);
        }
      }
      updated.push(itemId);
    }

    return { updated, errors };
  },

  // --- CIRCUIT STATE ---
  async getCircuitState(): Promise<CircuitState> {
    const client = getDocClient();
    if (client) {
      try {
        const result = await client.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: 'CIRCUIT#STATUS', SK: 'METADATA' },
          })
        );
        if (result.Item) {
          inMemoryStore.circuitState = result.Item as CircuitState;
          return result.Item as CircuitState;
        }
      } catch (err) {
        dbFailure('getCircuitState', err);
      }
    }

    if (inMemoryStore.circuitState) {
      return inMemoryStore.circuitState;
    }

    // Default to GREEN_FLAG
    const defaultState: CircuitState = {
      flag: 'GREEN_FLAG',
      ...CIRCUIT_FLAG_RULES['GREEN_FLAG'],
      updatedAt: new Date().toISOString(),
      updatedBy: 'system-default',
    };
    inMemoryStore.circuitState = defaultState;
    return defaultState;
  },

  async setCircuitState(
    flag: CircuitFlag,
    updatedBy = 'vendor',
    overrideMessage?: string
  ): Promise<CircuitState> {
    const rules = CIRCUIT_FLAG_RULES[flag];
    const state: CircuitState = {
      flag,
      offPeakDiscountPct: rules.offPeakDiscountPct,
      queueMultiplier: rules.queueMultiplier,
      message: overrideMessage ?? rules.message,
      updatedAt: new Date().toISOString(),
      updatedBy,
    };

    inMemoryStore.circuitState = state;

    const client = getDocClient();
    if (client) {
      try {
        await client.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              PK: 'CIRCUIT#STATUS',
              SK: 'METADATA',
              ...state,
            },
          })
        );
      } catch (err) {
        dbFailure('setCircuitState', err);
      }
    }

    return state;
  },

  // --- SMART LOCKER BAY ALLOCATION ---
  async allocateLockerBay(stationId: string): Promise<string> {
    // Load all active orders at this station
    const allOrders = await this.getAllOrders();
    const activeStatuses = new Set(['RECEIVED', 'PREPARING', 'READY_FOR_PICKUP']);
    const occupiedBays = new Set<string>();

    for (const order of allOrders) {
      if (order.pickupStationId === stationId && activeStatuses.has(order.status)) {
        if (order.counterNumber) {
          occupiedBays.add(order.counterNumber);
        }
      }
    }

    // Try bays #01..#08
    for (let i = 1; i <= 8; i++) {
      const bay = `#${String(i).padStart(2, '0')}`;
      if (!occupiedBays.has(bay)) {
        return bay;
      }
    }

    // All 8 full — overflow queue bays
    for (let i = 1; i <= 20; i++) {
      const bay = `#Q${i}`;
      if (!occupiedBays.has(bay)) {
        return bay;
      }
    }

    return '#Q99';
  },

  async getLockerBayStatus(stationId: string): Promise<LockerBayStatus[]> {
    const allOrders = await this.getAllOrders();
    const activeStatuses = new Set(['RECEIVED', 'PREPARING', 'READY_FOR_PICKUP']);

    // Build a map bay -> order for active orders at this station
    const bayMap = new Map<string, OrderRecord>();
    for (const order of allOrders) {
      if (order.pickupStationId === stationId && activeStatuses.has(order.status)) {
        if (order.counterNumber) {
          bayMap.set(order.counterNumber, order);
        }
      }
    }

    const result: LockerBayStatus[] = [];
    for (let i = 1; i <= 8; i++) {
      const bay = `#${String(i).padStart(2, '0')}`;
      const occupyingOrder = bayMap.get(bay);
      result.push(
        occupyingOrder
          ? {
              bay,
              stationId,
              status: 'OCCUPIED',
              orderId: occupyingOrder.orderId,
              pinCode: occupyingOrder.pinCode,
              orderStatus: occupyingOrder.status,
              updatedAt: occupyingOrder.updatedAt,
            }
          : {
              bay,
              stationId,
              status: 'AVAILABLE',
            }
      );
    }
    return result;
  },

  // --- FAN ORDER HISTORY (GSI1) ---
  async getOrdersByTicket(ticketCode: string): Promise<OrderRecord[]> {
    const cleanTicket = ticketCode.trim().toUpperCase();
    const client = getDocClient();

    if (client) {
      try {
        const result = await client.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: 'GSI1',
            KeyConditionExpression: 'GSI1PK = :tpk',
            ExpressionAttributeValues: { ':tpk': `TICKET#${cleanTicket}` },
            ScanIndexForward: false, // newest first
          })
        );
        return (result.Items ?? []) as OrderRecord[];
      } catch (err) {
        dbFailure('getOrdersByTicket', err);
      }
    }

    // In-memory fallback: filter and sort newest-first
    const local = Array.from(inMemoryStore.orders.values())
      .filter((o) => o.ticketCode.toUpperCase() === cleanTicket)
      .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    return local;
  },
};
