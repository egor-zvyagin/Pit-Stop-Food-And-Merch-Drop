import type { LucideIcon } from "lucide-react";
import {
  Ambulance,
  Banknote,
  Barcode,
  Beer,
  Camera,
  ChartLine,
  Check,
  ChevronDown,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleStop,
  Clock,
  CloudUpload,
  Coffee,
  Copy,
  CookingPot,
  Crosshair,
  Crown,
  DoorOpen,
  ExternalLink,
  Flag,
  FlagTriangleRight,
  FlaskConical,
  Flame,
  Footprints,
  Hamburger,
  Hash,
  House,
  Inbox,
  Info,
  LoaderCircle,
  Lock,
  LockOpen,
  Map,
  MapPin,
  Maximize2,
  Medal,
  Minus,
  Navigation,
  Package,
  Plane,
  Plus,
  Presentation,
  QrCode,
  Receipt,
  RefreshCw,
  RotateCcw,
  Satellite,
  ScanLine,
  Settings,
  Share2,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Star,
  Sun,
  Tag,
  Ticket,
  Timer,
  TriangleAlert,
  Users,
  Utensils,
  X,
  Zap,
} from "lucide-react";

/**
 * Bundled icon set.
 *
 * Icons used to be fetched from the Iconify web API at runtime, which left
 * every icon blank with no connection, exactly when a trackside app matters
 * most. This component keeps the old `icon="set:name"` call sites working
 * but renders lucide icons that ship inside the app bundle.
 */
const ICONS: Record<string, LucideIcon> = {
  "bx:map-alt": Map,
  "mdi:airplane": Plane,
  "mdi:alert-circle": CircleAlert,
  "mdi:camera": Camera,
  "mdi:car-emergency": Ambulance,
  "mdi:chart-line": ChartLine,
  "mdi:check-circle": CircleCheck,
  "mdi:clock-outline": Clock,
  "mdi:close": X,
  "mdi:cloud-sync-outline": CloudUpload,
  "mdi:flag": Flag,
  "mdi:flag-checkered": FlagTriangleRight,
  "mdi:food": Utensils,
  "mdi:home-outline": House,
  "mdi:information": Info,
  "mdi:lightning-bolt": Zap,
  "mdi:loading": LoaderCircle,
  "mdi:lock-open-outline": LockOpen,
  "mdi:lock-outline": Lock,
  "mdi:locker-multiple": Inbox,
  "mdi:map-marker-outline": MapPin,
  "mdi:minus": Minus,
  "mdi:numeric": Hash,
  "mdi:package-variant-closed": Package,
  "mdi:plus": Plus,
  "mdi:qrcode-scan": ScanLine,
  "mdi:refresh": RefreshCw,
  "mdi:shield-alert": ShieldAlert,
  "mdi:shield-check": ShieldCheck,
  "mdi:shield-lock-outline": ShieldCheck,
  "mdi:shield-remove": ShieldX,
  "mdi:tray-full": Inbox,
  "noto:billed-cap": Shirt,
  "noto:french-fries": Utensils,
  "noto:hamburger": Hamburger,
  "noto:hot-beverage": Coffee,
  "noto:t-shirt": Shirt,
  "ph:arrow-counter-clockwise": RotateCcw,
  "ph:arrow-square-out-bold": ExternalLink,
  "ph:arrows-clockwise-bold": RefreshCw,
  "ph:arrows-out-simple-bold": Maximize2,
  "ph:barcode-bold": Barcode,
  "ph:caret-down-bold": ChevronDown,
  "ph:check": Check,
  "ph:check-bold": Check,
  "ph:check-circle-bold": CircleCheck,
  "ph:check-circle-fill": CircleCheck,
  "ph:circle-dashed": CircleDashed,
  "ph:clock-countdown-bold": Timer,
  "ph:cooking-pot-bold": CookingPot,
  "ph:copy": Copy,
  "ph:crosshair-bold": Crosshair,
  "ph:crosshair-simple": Crosshair,
  "ph:crown-fill": Crown,
  "ph:door-bold": DoorOpen,
  "ph:fire-fill": Flame,
  "ph:flag-checkered-fill": FlagTriangleRight,
  "ph:flask-bold": FlaskConical,
  "ph:fork-knife": Utensils,
  "ph:fork-knife-fill": Utensils,
  "ph:gear-fill": Settings,
  "ph:house": House,
  "ph:house-bold": House,
  "ph:house-fill": House,
  "ph:info": Info,
  "ph:info-bold": Info,
  "ph:lightning-fill": Zap,
  "ph:lock-fill": Lock,
  "ph:lock-key-fill": Lock,
  "ph:map-pin": MapPin,
  "ph:map-pin-bold": MapPin,
  "ph:map-pin-line-bold": MapPin,
  "ph:map-trifold": Map,
  "ph:medal-fill": Medal,
  "ph:money-fill": Banknote,
  "ph:navigation-arrow-fill": Navigation,
  "ph:package-bold": Package,
  "ph:person-simple-walk-bold": Footprints,
  "ph:presentation-chart-fill": Presentation,
  "ph:qr-code": QrCode,
  "ph:qr-code-fill": QrCode,
  "ph:receipt": Receipt,
  "ph:receipt-bold": Receipt,
  "ph:receipt-fill": Receipt,
  "ph:satellite-bold": Satellite,
  "ph:share-network-bold": Share2,
  "ph:shield-check-bold": ShieldCheck,
  "ph:shopping-bag": ShoppingBag,
  "ph:shopping-cart-simple-fill": ShoppingCart,
  "ph:spinner": LoaderCircle,
  "ph:spinner-gap-bold": LoaderCircle,
  "ph:star": Star,
  "ph:star-fill": Star,
  "ph:stop-circle-bold": CircleStop,
  "ph:sun-fill": Sun,
  "ph:tag-fill": Tag,
  "ph:ticket-fill": Ticket,
  "ph:timer-fill": Timer,
  "ph:users-three-bold": Users,
  "ph:warning-circle-bold": CircleAlert,
  "ph:warning-circle-fill": CircleAlert,
  "ph:warning-fill": TriangleAlert,
  // Beer has no Iconify alias in this app yet, but keep it reachable.
  "lucide:beer": Beer,
};

/** Names whose original was a solid glyph that reads better filled. */
const FILLED = new Set(["ph:star-fill", "ph:crown-fill", "ph:medal-fill"]);
const SPINNING = new Set(["mdi:loading", "ph:spinner", "ph:spinner-gap-bold"]);

export type IconProps = {
  icon: string;
  width?: number | string;
  height?: number | string;
  className?: string;
  "aria-hidden"?: boolean;
};

export function Icon({ icon, width = 20, height, className = "", ...rest }: IconProps) {
  const Glyph = ICONS[icon] ?? Circle;
  const size = Number(width ?? height ?? 20);
  const spin = SPINNING.has(icon) && !className.includes("animate-") ? " animate-spin" : "";
  return (
    <Glyph
      size={size}
      strokeWidth={2}
      fill={FILLED.has(icon) ? "currentColor" : "none"}
      className={`${className}${spin}`}
      aria-hidden={rest["aria-hidden"] ?? true}
    />
  );
}

export default Icon;
