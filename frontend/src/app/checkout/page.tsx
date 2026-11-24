import { Suspense } from "react";
import CheckoutScreen from "@/components/checkout/CheckoutScreen";

export default function Checkout() {
  return (
    <Suspense>
      <CheckoutScreen />
    </Suspense>
  );
}
