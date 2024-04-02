declare module 'systeminformation/lib/network' {
  import type { Systeminformation } from 'systeminformation';

  export function networkStats(ifaces?: string, cb?: (data: Systeminformation.NetworkStatsData[]) => any): Promise<Systeminformation.NetworkStatsData[]>;
}
