/// <reference types="systeminformation" />

declare module 'systeminformation/lib/network' {
    export function networkStats(ifaces?: string, cb?: (data: Systeminformation.NetworkStatsData[]) => any): Promise<Systeminformation.NetworkStatsData[]>;
}