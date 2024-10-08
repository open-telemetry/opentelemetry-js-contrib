import {Histogram} from "perf_hooks";

declare module 'node:perf_hooks' {
  interface IntervalHistogram extends Histogram {
    /**
     * Enables the update interval timer. Returns `true` if the timer was
     * started, `false` if it was already started.
     * @since v11.10.0
     */
    enable(): boolean;

    /**
     * Disables the update interval timer. Returns `true` if the timer was
     * stopped, `false` if it was already stopped.
     * @since v11.10.0
     */
    disable(): boolean;

    count: number;
  }
}
