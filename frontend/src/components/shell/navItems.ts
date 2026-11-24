import { Map, Receipt, Star, UtensilsCrossed, type LucideIcon } from "lucide-react";

export type NavItem = { label: string; href: string; icon: LucideIcon };

export const NAV_ITEMS: NavItem[] = [
  { label: "Menu", href: "/", icon: UtensilsCrossed },
  { label: "Pickup map", href: "/map", icon: Map },
  { label: "Orders", href: "/collect", icon: Receipt },
  { label: "Rewards", href: "/rewards", icon: Star },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/order");
  return pathname.startsWith(href);
}
