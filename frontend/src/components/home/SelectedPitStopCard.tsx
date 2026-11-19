import { Icon } from "@iconify/react";

import Button from "@/components/ui/Buttons";
import Card from "@/components/ui/Card";
import Typography from "@/components/ui/Typography";
import { useRouter } from "next/navigation";
import PitStopInfo, { PitStopLike } from "../pitstop/PitStopInfo";
import { PitStop } from "@/data/pitStopConstantData";

type SelectedPitStopCardProps = {
    stop: PitStop | PitStopLike;
    distanceDisplay?: string;
    isFastestTotal?: boolean;
    onViewMap: () => void;
};

export default function SelectedPitStopCard({
    stop,
    distanceDisplay,
    isFastestTotal = false,
    onViewMap,
}: SelectedPitStopCardProps) {
    const router = useRouter();

    return (
        <Card className="!rounded-[14px] !p-4 shadow-card">
            {/* Stop details */}
            <PitStopInfo
                stop={stop}
                selected
                showLocationIcon
                distanceDisplay={distanceDisplay}
                isFastestTotal={isFastestTotal}
            />

            {/* Actions */}
            <div className="mt-[14px] grid grid-cols-2 gap-[10px]">
                {/* Primary button */}
                <Button
                    onClick={() => router.push("/order")}
                    className="
                        flex
                        !h-[46px]
                        items-center
                        justify-center
                        gap-[6px]
                        !rounded-[10px]
                    "
                >
                    <Icon
                        icon="ph:shopping-cart-simple-fill"
                        width="16"
                        height="16"
                    />

                    <Typography
                        variant="button"
                        className="
                            text-[15px]
                            tracking-[0.6px]
                        "
                    >
                        ORDER HERE
                    </Typography>
                </Button>

                {/* Secondary button */}
                <button
                    type="button"
                    onClick={onViewMap}
                    className="
                        flex
                        h-[46px]
                        items-center
                        justify-center
                        gap-[6px]
                        rounded-[10px]
                        border
                        border-[var(--color-border)]
                        bg-[var(--color-page-background)]
                        hover:bg-[var(--color-border)]/50
                        transition-colors
                    "
                >
                    <Icon
                        icon="ph:map-trifold"
                        width="16"
                        height="16"
                        className="text-[var(--color-text-primary)]"
                    />

                    <Typography
                        variant="button"
                        className="
                            text-[15px]
                            tracking-[0.6px]
                            text-[var(--color-text-primary)]
                        "
                    >
                        VIEW MAP
                    </Typography>
                </button>
            </div>
        </Card>
    );
}
