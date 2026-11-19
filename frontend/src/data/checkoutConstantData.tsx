export const SERVICE_FEES_ITEMS = 1.5;
export const SERVICE_FEES_ZERO_ITEMS = 0;
export const REWARD_POINT_MULTIPLIER = 10;

// Dynamic Yield & Reward Vouchers
export const CHECKOUT_VOUCHERS = [
    {
        id: "pitstop-15-discount",
        code: "PITSTOP15",
        title: "15% Green-Flag Discount",
        description: "-15% Off Trackside Concessions",
        effect: {
            type: "discount",
            amount: 6.5,
        },
    },
    {
        id: "eatclub-20-discount",
        code: "EATCLUB20",
        title: "20% EatClub Trackside Yield",
        description: "-20% Off Concession Order",
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
        title: "Free Cold Brew",
        description: "Added to your order for free",
        effect: {
            type: "freeItem",
            itemId: "cold-brew",
        },
    },
    {
        id: "free-fries",
        code: "FREE-FRIES",
        title: "Free Fries Upgrade",
        description: "Trackside Loaded Fries free",
        effect: {
            type: "freeItem",
            itemId: "fries",
        },
    },
] as const;

export type CheckoutVoucherData =
    (typeof CHECKOUT_VOUCHERS)[number];

export type CheckoutVoucherId =
    CheckoutVoucherData["id"];

export const INVALID_VOUCHER_MESSAGE =
    "Invalid code. Try 'PITSTOP15' or check your Rewards tab.";
