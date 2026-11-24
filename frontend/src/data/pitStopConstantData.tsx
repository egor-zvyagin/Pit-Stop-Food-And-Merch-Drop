import type { StationQueueStatus } from "@/lib/types";

export type PitStopId = "M1" | "M2" | "M3" | "M4";
export type PitStopVariant = "lowQueue" | "fastest" | "heavyTraffic";

export interface PitStop {
    id: PitStopId;
    /** Name stored on orders and shown to staff, e.g. "Pit Stop M2". */
    name: string;
    /** Where the pod is, in the words a fan uses: the nearest corner. */
    label: string;
    /** The stands the pod sits behind. */
    area: string;
    /** Legacy one-line summary, kept for older screens. */
    distance: string;
    /** Walk from the stands it serves, in minutes. */
    walkMins: number;
    /** Seeded queue time before live data arrives, in minutes. */
    queueMins: number;
    status: StationQueueStatus;
    variant: PitStopVariant;
    latitude: number;
    longitude: number;
    queueWaitMinutes?: number;
}

export const PIT_STOPS: readonly PitStop[] = [
    {
        id: "M1",
        name: "Pit Stop M1",
        label: "Pit straight",
        area: "Behind the Fangio and Senna stands",
        distance: "Pit straight, 1 min walk",
        walkMins: 1,
        queueMins: 3,
        status: "LOW QUEUE",
        variant: "lowQueue",
        latitude: -37.8496,
        longitude: 144.9690,
    },
    {
        id: "M2",
        name: "Pit Stop M2",
        label: "Turn 9",
        area: "Between the Clark and Waite stands",
        distance: "Turn 9, 2 min walk",
        walkMins: 2,
        queueMins: 2,
        status: "FASTEST",
        variant: "fastest",
        latitude: -37.8442,
        longitude: 144.9746,
    },
    {
        id: "M3",
        name: "Pit Stop M3",
        label: "Turn 4",
        area: "Lakeside Drive, by the Brabham and Jones stands",
        distance: "Turn 4, 5 min walk",
        walkMins: 5,
        queueMins: 9,
        status: "HEAVY TRAFFIC",
        variant: "heavyTraffic",
        latitude: -37.8415,
        longitude: 144.9648,
    },
    {
        id: "M4",
        name: "Pit Stop M4",
        label: "Turn 14",
        area: "General admission village",
        distance: "Turn 14, 20 min walk",
        walkMins: 20,
        queueMins: 12,
        status: "HEAVY TRAFFIC",
        variant: "heavyTraffic",
        latitude: -37.8534,
        longitude: 144.9718,
    },
] as const;
