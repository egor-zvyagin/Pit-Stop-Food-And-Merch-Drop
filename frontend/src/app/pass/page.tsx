import { redirect } from "next/navigation";

// The pickup pass (QR code and PIN) now lives on the Orders screen.
export default function OrderPassPage() {
  redirect("/collect");
}
