import type { StationQueueStatus } from "@/lib/types";

export type PitStopId = "M1" | "M2" | "M3" | "M4";
export type PitStopVariant = "lowQueue" | "fastest" | "heavyTraffic";

export interface PitStop {
    id: PitStopId;
    name: string;
    distance: string;
    status: StationQueueStatus;
    variant: PitStopVariant;
    latitude: number;
    longitude: number;
    queueWaitMinutes?: number;
}

export const PIT_STOPS: readonly PitStop[] = [
    {
        id: "M1",
        name: "PIT STOP M1",
        distance: "Grandstand A · 1 min walk",
        status: "LOW QUEUE",
        variant: "lowQueue",
        latitude: -37.8496,
        longitude: 144.9690,
    },
    {
        id: "M2",
        name: "PIT STOP M2",
        distance: "Grandstand A · 2 min walk",
        status: "FASTEST",
        variant: "fastest",
        latitude: -37.8442,
        longitude: 144.9746,
    },
    {
        id: "M3",
        name: "PIT STOP M3",
        distance: "Grandstand A · 5 min walk",
        status: "HEAVY TRAFFIC",
        variant: "heavyTraffic",
        latitude: -37.8415,
        longitude: 144.9648,
    },
    {
        id: "M4",
        name: "PIT STOP M4",
        distance: "Grandstand A · 20 min walk",
        status: "HEAVY TRAFFIC",
        variant: "heavyTraffic",
        latitude: -37.8534,
        longitude: 144.9718,
    },
] as const;
