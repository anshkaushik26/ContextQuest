// Server clock offset. The countdown is always derived from server deadlines plus this
// offset — never from counting client-side intervals — so three screens can't drift apart.

let offset = 0;
let bestRtt = Infinity;

export const serverNow = () => Date.now() + offset;

/** Feed one ping sample; keeps the lowest-latency sample, which is the most accurate. */
export function addSample(t0: number, server: number, t1: number) {
  const rtt = t1 - t0;
  if (rtt <= bestRtt) {
    bestRtt = rtt;
    offset = server + rtt / 2 - t1;
  }
}

/** Passive correction from state pushes, used only until a ping sample exists. */
export function hintServerTime(server: number) {
  if (bestRtt === Infinity) offset = server - Date.now();
}

export function resetClock() {
  bestRtt = Infinity;
}
