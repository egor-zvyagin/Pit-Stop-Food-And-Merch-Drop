import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { MENU_ITEMS, MenuItem } from '@/data/menu';
import { PIT_STOPS, PitStop } from '@/data/pitStopConstantData';

export interface OrderItemRecord {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  sku?: string;
}

export interface OrderRecord {
  orderId: string;
  pinCode: string;
  customerId: string;
  ticketCode: string;
  isGroupOrder: boolean;
  items: OrderItemRecord[];
  subtotal: number;
  discountAmount: number;
  discountRate: string;
  total: number;
  loyaltyPointsEarned: number;
  pickupStationId: string;
  pickupStationName: string;
  counterNumber: string;
  walkTimeMins: number;
  qrPayload: string;
  signatureBase64: string;
  status: 'RECEIVED' | 'PREPARING' | 'READY_FOR_PICKUP' | 'COMPLETED';
  createdAt: string;
  updatedAt: string;
}

export interface TicketProfile {
  ticketCode: string;
  verified: boolean;
  holderName: string;
  ticketType: string;
  viewingArea: {
    grandstand: string;
    turn: string;
    seat: string;
    nearestGate: string;
    recommendedDropStation: string;
  };
  loyaltyTier: string;
  loyaltyPoints: number;
}

// In-Memory Fallback State
const inMemoryStore = {
  items: new Map<string, MenuItem>(),
  orders: new Map<string, OrderRecord>(),
  stations: new Map<string, PitStop>(),
  tickets: new Map<string, TicketProfile>(),
  initialized: false,
};

function initInMemoryDefaults() {
  if (inMemoryStore.initialized) return;

  MENU_ITEMS.forEach((item) => {
    inMemoryStore.items.set(item.id, item);
  });

  PIT_STOPS.forEach((stop) => {
    inMemoryStore.stations.set(stop.id, stop);
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

  inMemoryStore.initialized = true;
}

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'pitstop_data';
const REGION = process.env.AWS_REGION || 'ap-southeast-2';

const isAwsConfigured =
  process.env.USE_LOCAL_STORAGE !== 'true' &&
  (Boolean(process.env.AWS_ACCESS_KEY_ID) ||
    Boolean(process.env.AWS_PROFILE) ||
    Boolean(process.env.AWS_EXECUTION_ENV) ||
    Boolean(process.env.AWS_SESSION_TOKEN));

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

export const db = {
  isUsingDynamoDB: Boolean(docClient),

  // --- CONCESSION ITEMS ---
  async saveItem(item: MenuItem): Promise<void> {
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

  async getItems(): Promise<MenuItem[]> {
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
          return result.Items as MenuItem[];
        }
      } catch (err) {
        console.warn('DynamoDB getItems error, using fallback:', err);
      }
    }
    return Array.from(inMemoryStore.items.values());
  },

  async getItemById(id: string): Promise<MenuItem | undefined> {
    if (docClient) {
      try {
        const result = await docClient.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { PK: `ITEM#${id}`, SK: 'METADATA' },
          })
        );
        if (result.Item) return result.Item as MenuItem;
      } catch (err) {
        console.warn('DynamoDB getItemById error, using fallback:', err);
      }
    }
    return inMemoryStore.items.get(id);
  },

  // --- ORDERS ---
  async createOrder(order: OrderRecord): Promise<OrderRecord> {
    if (docClient) {
      try {
        await docClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              PK: `ORDER#${order.orderId}`,
              SK: 'METADATA',
              GSI1PK: `TICKET#${order.ticketCode}`,
              GSI1SK: `ORDER#${order.orderId}`,
              ...order,
            },
          })
        );
      } catch (err) {
        console.warn('DynamoDB createOrder error, storing locally:', err);
      }
    }
    inMemoryStore.orders.set(order.orderId, order);
    return order;
  },

  async getOrderById(orderId: string): Promise<OrderRecord | undefined> {
    const cleanId = orderId.toUpperCase();
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
    // Check in-memory first for fast lookup
    for (const order of Array.from(inMemoryStore.orders.values())) {
      if (order.pinCode === pinCode) {
        return order;
      }
    }

    if (docClient) {
      try {
        const result = await docClient.send(
          new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: 'pinCode = :pin AND begins_with(PK, :prefix)',
            ExpressionAttributeValues: {
              ':pin': pinCode,
              ':prefix': 'ORDER#',
            },
          })
        );
        if (result.Items && result.Items.length > 0) {
          return result.Items[0] as OrderRecord;
        }
      } catch (err) {
        console.warn('DynamoDB getOrderByPin error:', err);
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

  // --- STATIONS ---
  async saveStation(station: PitStop): Promise<void> {
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

  async getStations(): Promise<PitStop[]> {
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
          return result.Items as PitStop[];
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
        loyaltyTier: 'Race Enthusiast',
        loyaltyPoints: 500,
      };
      inMemoryStore.tickets.set(clean, generated);
      return generated;
    }

    return undefined;
  },
};
