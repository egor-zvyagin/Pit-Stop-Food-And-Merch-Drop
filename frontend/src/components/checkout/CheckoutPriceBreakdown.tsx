import Card from "@/components/ui/Card";
import Typography from "@/components/ui/Typography";

type CheckoutPriceBreakdownProps = {
    subtotal: number;
    serviceFee: number;
    dynamicDiscount?: number;
    voucherDiscount: number;
    voucherLabel?: string;
    total: number;
    circuitFlag?: string;
};

export default function CheckoutPriceBreakdown({
    subtotal,
    serviceFee,
    dynamicDiscount = 0,
    voucherDiscount,
    voucherLabel,
    total,
    circuitFlag,
}: CheckoutPriceBreakdownProps) {
    const isSafetyCar = circuitFlag?.toUpperCase().includes("SAFETY");

    return (
        <Card className="!rounded-[12px] !px-4 !py-[14px]">
            <Typography
                variant="meta"
                className="
                    tracking-[0.66px]
                    !text-[var(--color-text-muted)]
                "
            >
                PRICE BREAKDOWN
            </Typography>

            <div className="mt-3 flex flex-col gap-2">
                <PriceRow
                    label="Subtotal"
                    value={`$${subtotal.toFixed(2)}`}
                />

                {/* Dynamic Yield Discount (Green Flag / Post Race) */}
                {dynamicDiscount > 0 && (
                    <PriceRow
                        label="Dynamic Yield Discount (10%)"
                        value={`−$${dynamicDiscount.toFixed(2)}`}
                        success
                    />
                )}

                {isSafetyCar && (
                    <div className="flex items-center justify-between text-[11px] text-amber-400 font-mono">
                        <span>Dynamic Discount</span>
                        <span>Paused (Safety Car)</span>
                    </div>
                )}

                <PriceRow
                    label="Delivery"
                    value="FREE"
                    success
                />

                <PriceRow
                    label="Service fee"
                    value={`$${serviceFee.toFixed(2)}`}
                />

                {/* Reward Discount voucher */}
                {voucherDiscount > 0 && (
                    <PriceRow
                        label={`Voucher (${voucherLabel || "Applied"})`}
                        value={`−$${voucherDiscount.toFixed(2)}`}
                        success
                    />
                )}

                <div
                    className="
                        my-1
                        h-px
                        bg-[var(--color-border)]
                    "
                />

                <div className="flex items-center justify-between">
                    <Typography
                        variant="sectionHeader"
                        className="
                            !text-[18px]
                            !leading-[27px]
                        "
                    >
                        TOTAL
                    </Typography>

                    <Typography
                        variant="sectionHeader"
                        className="
                            !text-[18px]
                            !leading-[27px]
                            !text-[var(--color-brand-primary)]
                        "
                    >
                        ${total.toFixed(2)}
                    </Typography>
                </div>
            </div>
        </Card>
    );
}

type PriceRowProps = {
    label: string;
    value: string;
    success?: boolean;
};

function PriceRow({
    label,
    value,
    success = false,
}: PriceRowProps) {
    return (
        <div className="flex items-center justify-between">
            <Typography
                variant="body"
                className="
                    !text-[14px]
                    !leading-[21px]
                    !text-[var(--color-text-muted)]
                "
            >
                {label}
            </Typography>

            <Typography
                variant="body"
                className={`
                    !text-[14px]
                    !leading-[21px]

                    ${success
                        ? "!font-semibold !text-[var(--color-status-success)]"
                        : "!text-[var(--color-text-primary)]"
                    }
                `}
            >
                {value}
            </Typography>
        </div>
    );
}
