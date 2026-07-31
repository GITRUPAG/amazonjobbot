// Continuous in-process polling. Requires a host that keeps the process
// alive (Railway, Fly.io, a VPS) — this will NOT work on serverless hosting,
// since the interval dies the moment the function instance is torn down.

const POLL_INTERVAL_MS = Number(process.env.SCRAPE_POLL_INTERVAL_MS ?? 2000);

let timer: ReturnType<typeof setInterval> | null = null;
let tickRunning = false;

export function startPollLoop(appOrigin: string) {
  if (timer) return; // already running in this process

  timer = setInterval(async () => {
    if (tickRunning) {
      console.warn("pollLoop: previous tick still in flight, skipping this tick");
      return;
    }
    tickRunning = true;
    try {
      // Dynamic import, not a static top-level one — .server.ts files in this
      // codebase are always loaded this way. A static import here was part
      // of the actual cause of "startPollLoop is not a function".
      const { scrapeAndBroadcast } = await import("@/lib/broadcast.server");
      const result = await scrapeAndBroadcast(appOrigin);
      if ("error" in result) {
        console.error("pollLoop: tick returned an error", result.error);
      } else if (result.new && result.new > 0) {
        console.log(
          `pollLoop: ${result.new} new job(s) — channel:${result.channelSent ?? 0} dm:${result.dmSent ?? 0}`
        );
      }
    } catch (e) {
      console.error("pollLoop: tick threw", e);
    } finally {
      tickRunning = false;
    }
  }, POLL_INTERVAL_MS);

  console.log(`pollLoop: started, polling every ${POLL_INTERVAL_MS}ms`);
}

export function stopPollLoop() {
  if (timer) clearInterval(timer);
  timer = null;
}