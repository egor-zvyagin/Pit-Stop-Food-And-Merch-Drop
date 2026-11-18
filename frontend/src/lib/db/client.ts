import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  ScanCommand,
  QueryCommand,
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
};

// In-Memory Fallback State
const inMemoryStore = {
  items: new Map<string, CatalogItem>(),
  orders: new Map<string, OrderRecord>(),
  stations: new Map<string, StationRecord>(),
  tickets: new Map<string, TicketProfile>(),
  ticketHistory: new Map<string, RewardsHistoryItem[]>(),
  awardedOrders: new Set<string>(),
  initialized: false,
};

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

  inMemoryStore.initialized = true;
}

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'pitstop_data';
const REGION = process.env.AWS_REGION || 'ap-southeast-2';

const isAwsConfigured =
  process.env.USE_LOCAL_STORAGE !== 'true';

let docClient: DynamoDBDocumentClient | null = null;

if (isAwsConfigured) {
  try {
    const rawClient = new DynamoDBClient({ region: REGION });
    docClient = DynamoDBDocumentClient.from(rawClient);
  } catch (err) {
    console.warn('Failed to initialize AWS DynamoDB client, falling back to local store:', err);
    docClient = null;
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
  isUsingDynamoDB: Boolean(docClient),

  // --- CONCESSION ITEMS ---
  async saveItem(item: CatalogItem): Promise<void> {
    if (docClient) {
      try {
        await docClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              PK: `ITEM#${item.id}`,
              SK: 'METADATA',
              ...item,
            },
          })
        );
      } catch (err) {
        console.warn('DynamoDB saveItem error:', err);
      }
    }
    inMemoryStore.items.set(item.id, item);
  },

  async getItems(): Promise<CatalogItem[]> {
    if (docClient) {
      try {
        const result = await docClient.send(
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
        console.warn('DynamoDB getItems error, using fallback:', err);
      }
    }
    return Array.from(inMemoryStore.items.values());
  },

  async getItemById(id: string): Promise<CatalogItem | undefined> {
    if (docClient) {
      try {
        const result = await docClient.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `ITEM#${id}`, SK: 'METADATA' },
          })
        );
        if (result.Item) return result.Item as CatalogItem;
      } catch (err) {
        console.warn('DynamoDB getItemById error, using fallback:', err);
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

    if (docClient) {
      try {
        await docClient.send(
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
        console.warn('DynamoDB createOrder error, storing locally:', err);
      }
    }
    inMemoryStore.orders.set(fullOrder.orderId, fullOrder);
    return fullOrder;
  },

  async getOrderById(orderId: string): Promise<OrderRecord | undefined> {
    const cleanId = orderId.toUpperCase();
    if (inMemoryStore.orders.has(cleanId)) {
      return inMemoryStore.orders.get(cleanId);
    }

    if (docClient) {
      try {
        const result = await docClient.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `ORDER#${cleanId}`, SK: 'METADATA' },
          })
        );
        if (result.Item) return result.Item as OrderRecord;
      } catch (err) {
        console.warn('DynamoDB getOrderById error, using fallback:', err);
      }
    }
    return inMemoryStore.orders.get(cleanId);
  },

  async getOrderByPin(pinCode: string): Promise<OrderRecord | undefined> {
    // 1. Fast in-memory lookup
    for (const order of Array.from(inMemoryStore.orders.values())) {
      if (order.pinCode === pinCode) {
        return order;
      }
    }

    // 2. DynamoDB GSI2 Query (GSI2PK = PIN#<pinCode>) with scan fallback
    if (docClient) {
      try {
        const result = await docClient.send(
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
          const scanResult = await docClient.send(
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
          console.warn('DynamoDB getOrderByPin scan error:', scanErr);
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

    if (docClient) {
      try {
        await docClient.send(
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
        console.warn('DynamoDB updateOrderStatus error:', err);
      }
    }

    return existing;
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

    if (docClient) {
      try {
        await docClient.send(
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
        console.warn('DynamoDB updateOrderPaymentStatus error:', err);
      }
    }

    return existing;
  },

  async getAllOrders(): Promise<OrderRecord[]> {
    if (docClient) {
      try {
        const result = await docClient.send(
          new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: 'begins_with(PK, :prefix) AND SK = :sk',
            ExpressionAttributeValues: {
              ':prefix': 'ORDER#',
              ':sk': 'METADATA',
            },
          })
        );
        if (result.Items && result.Items.length > 0) {
          return result.Items as OrderRecord[];
        }
      } catch (err) {
        console.warn('DynamoDB getAllOrders error, using fallback:', err);
      }
    }
    return Array.from(inMemoryStore.orders.values());
  },

  async getOrders(ticketCode?: string): Promise<OrderRecord[]> {
    if (ticketCode) {
      const cleanTicket = ticketCode.trim().toUpperCase();
      // Try GSI1 Query by ticketCode
      if (docClient) {
        try {
          const result = await docClient.send(
            new QueryCommand({
              TableName: TABLE_NAME,
              IndexName: 'GSI1',
              KeyConditionExpression: 'GSI1PK = :tpk',
              ExpressionAttributeValues: {
                ':tpk': `TICKET#${cleanTicket}`,
              },
            })
          );
          if (result.Items && result.Items.length > 0) {
            return result.Items as OrderRecord[];
          }
        } catch (err) {
          console.warn('GSI1 query error, filtering in-memory/scan:', err);
        }
      }

      // Filter in-memory
      const local = Array.from(inMemoryStore.orders.values()).filter(
        (o) => o.ticketCode.toUpperCase() === cleanTicket
      );
      if (local.length > 0) return local;
    }

    return this.getAllOrders();
  },

  // --- STATIONS ---
  async saveStation(station: StationRecord): Promise<void> {
    if (docClient) {
      try {
        await docClient.send(
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
        console.warn('DynamoDB saveStation error:', err);
      }
    }
    inMemoryStore.stations.set(station.id, station);
  },

  async getStations(): Promise<StationRecord[]> {
    if (docClient) {
      try {
        const result = await docClient.send(
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
        console.warn('DynamoDB getStations error, using fallback:', err);
      }
    }
    return Array.from(inMemoryStore.stations.values());
  },

  // --- TICKETS ---
  async saveTicket(ticket: TicketProfile): Promise<void> {
    if (docClient) {
      try {
        await docClient.send(
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
        console.warn('DynamoDB saveTicket error:', err);
      }
    }
    inMemoryStore.tickets.set(ticket.ticketCode, ticket);
  },

  async getTicket(ticketCode: string): Promise<TicketProfile | undefined> {
    const clean = ticketCode.trim().toUpperCase();
    if (docClient) {
      try {
        const result = await docClient.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `TICKET#${clean}`, SK: 'PROFILE' },
          })
        );
        if (result.Item) return result.Item as TicketProfile;
      } catch (err) {
        console.warn('DynamoDB getTicket error, using fallback:', err);
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
};
