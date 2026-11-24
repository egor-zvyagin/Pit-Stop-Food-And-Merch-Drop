export const SERVICE_FEES_ITEMS = 1.5;
export const SERVICE_FEES_ZERO_ITEMS = 0;
export const REWARD_POINT_MULTIPLIER = 10;

// Dynamic Yield & Reward Vouchers
export const CHECKOUT_VOUCHERS = [
    {
        id: "pitstop-15-discount",
        code: "PITSTOP15",
        title: "15% off your order",
        description: "15% off food and merch",
        effect: {
            type: "discount",
            amount: 6.5,
        },
    },
    {
        id: "crew-20-discount",
        code: "CREW20",
        title: "20% crew discount",
        description: "20% off your order",
        effect: {
            type: "discount",
            amount: 8.5,
        },
    },
    {
        id: "five-dollar-discount",
        code: "GP-SAVE05",
        title: "Reward Discount",
        description: "-$5.00 applied",
        effect: {
            type: "discount",
            amount: 5,
        },
    },
    {
        id: "free-cold-brew",
        code: "GP-BREW01",
        title: "Free spring water",
        description: "Spring water on us",
        effect: {
            type: "freeItem",
            itemId: "still-water",
        },
    },
    {
        id: "free-fries",
        code: "FREE-FRIES",
        title: "Free loaded fries",
        description: "Loaded fries on us",
        effect: {
            type: "freeItem",
            itemId: "loaded-fries",
        },
    },
] as const;

export type CheckoutVoucherData =
    (typeof CHECKOUT_VOUCHERS)[number];

export type CheckoutVoucherId =
    CheckoutVoucherData["id"];

export const INVALID_VOUCHER_MESSAGE =
    "Invalid code. Try 'PITSTOP15' or check your Rewards tab.";
