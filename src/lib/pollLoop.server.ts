// Continuous in-process polling — human-paced version.
//
// Previous version polled every 2s on a fixed setInterval. That traffic
// pattern (rapid, perfectly regular, from one IP) is exactly what CloudFront/
// WAF rate-based rules are built to catch, and it got this app blocked.
//
// This version:
//   - defaults to a MUCH slower interval (10 minutes, not 2 seconds)
//   - adds random jitter so requests don't land on a perfectly robotic clock
//   - uses setTimeout-chained scheduling (not setInterval) so a slow tick
//     can't overlap the next one
//   - backs off exponentially on failures instead of retrying at the same
//     cadence, and resets to the normal interval after a clean success
//
// Requires a host that keeps the process alive (Railway, Fly.io, a VPS) —
// this will NOT work on serverless hosting, since the loop dies the moment
// the function instance is torn down.

const BASE_INTERVAL_MS = Number(process.env.SCRAPE_POLL_INTERVAL_MS ?? 10 * 60 * 1000); // 10 min default
const MAX_BACKOFF_MS = Number(process.env.SCRAPE_MAX_BACKOFF_MS ?? 60 * 60 * 1000); // cap at 1 hour
const JITTER_RATIO = 0.2; // +/- 20% randomness around the base interval

let timer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;
let consecutiveFailures = 0;

function withJitter(ms: number): number {
  const delta = ms * JITTER_RATIO;
  return Math.round(ms + (Math.random() * 2 - 1) * delta);
}

function nextDelay(): number {
  if (consecutiveFailures === 0) return withJitter(BASE_INTERVAL_MS);
  // Exponential backoff: base * 2^failures, capped.
  const backoff = Math.min(BASE_INTERVAL_MS * 2 ** consecutiveFailures, MAX_BACKOFF_MS);
  return withJitter(backoff);
}

export function startPollLoop(appOrigin: string) {
  if (timer) return; // already running in this process
  stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      // Dynamic import, not a static top-level one — .server.ts files in this
      // codebase are always loaded this way.
      const { scrapeAndBroadcast } = await import("@/lib/broadcast.server");
      const result = await scrapeAndBroadcast(appOrigin);

      if ("error" in result) {
        consecutiveFailures++;
        console.error(
          `pollLoop: tick returned an error (failure #${consecutiveFailures}):`,
          result.error
        );
      } else {
        if (consecutiveFailures > 0) {
          console.log(`pollLoop: recovered after ${consecutiveFailures} failed tick(s)`);
        }
        consecutiveFailures = 0;
        if (result.new && result.new > 0) {
          console.log(
            `pollLoop: ${result.new} new job(s) — channel:${result.channelSent ?? 0} dm:${result.dmSent ?? 0}`
          );
        }
      }
    } catch (e) {
      consecutiveFailures++;
      console.error(`pollLoop: tick threw (failure #${consecutiveFailures})`, e);
    } finally {
      if (!stopped) {
        const delay = nextDelay();
        console.log(
          `pollLoop: next tick in ${Math.round(delay / 1000)}s` +
            (consecutiveFailures > 0 ? ` (backing off after ${consecutiveFailures} failure(s))` : "")
        );
        timer = setTimeout(tick, delay);
      }
    }
  };

  console.log(`pollLoop: started — base interval ${Math.round(BASE_INTERVAL_MS / 1000)}s with jitter`);
  // Small initial delay rather than firing immediately on boot.
  timer = setTimeout(tick, withJitter(BASE_INTERVAL_MS));
}

export function stopPollLoop() {
  stopped = true;
  if (timer) clearTimeout(timer);
  timer = null;
  consecutiveFailures = 0;
}