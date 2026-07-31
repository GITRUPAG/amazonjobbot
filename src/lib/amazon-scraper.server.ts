// Server-only Amazon UK jobs scraper — human-paced version.
//
// Previous version launched a browser once, captured a GraphQL request, and
// replayed it via raw fetch every ~2s forever. That replay pattern — same
// session, zero navigation, identical request fired on a robotic clock — is
// a strong bot fingerprint on top of the interval itself, and it's part of
// what got this app blocked by CloudFront/WAF.
//
// This version launches a fresh browser, does ONE real navigation, and lets
// the page's own script fire its own search request naturally. We just
// listen for that response rather than replaying anything ourselves. Then
// we close the browser. At a 10-minute polling cadence there's no
// performance reason to keep a session warm — a fresh, human-shaped visit
// every 10 minutes is both simpler and a much better traffic signature.
//
// Note: this fetches ONE broad, UK-wide result set per poll rather than a
// separate navigation per configured search query — multiplying navigations
// by query count would undo the point of slowing down. Per-subscriber
// keyword/city filtering still happens downstream in broadcast.server.ts
// (matchesFilter), so subscribers still only get jobs matching what they
// asked for; this just changes how broadly we fetch, not how narrowly we
// deliver.

export type ScrapedJob = {
  external_id: string;
  region: "UK";
  title: string;
  city: string | null;
  state: string | null;
  warehouse: string | null;
  job_type: string | null;
  employment_type: string | null;
  pay_rate: string | null;
  description: string | null;
  url: string;
  posted_at: string | null;
  source: "json" | "html";
  raw: any;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
];

function pickUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

const UK_DEFAULT_GEO = { lat: 52.3555, lng: -1.1743 };

type UKJobCard = {
  jobId: string;
  jobTitle: string;
  jobType: string | null;
  employmentType: string | null;
  employmentTypeL10N: string | null;
  city: string | null;
  state: string | null;
  totalPayRateMinL10N: string | null;
  totalPayRateMaxL10N: string | null;
  tagLine: string | null;
  jobContainerJobMetaL1: string[] | null;
  [key: string]: any;
};

function normalizeUKJobCard(j: UKJobCard): ScrapedJob {
  return {
    external_id: j.jobId,
    region: "UK",
    title: j.jobTitle ?? "Amazon Warehouse",
    city: j.city || null,
    state: j.state || null,
    warehouse: (j.jobContainerJobMetaL1 || []).join(", ") || null,
    job_type: j.jobType || null,
    employment_type: j.employmentTypeL10N || j.employmentType || null,
    pay_rate:
      j.totalPayRateMinL10N && j.totalPayRateMaxL10N
        ? j.totalPayRateMinL10N === j.totalPayRateMaxL10N
          ? j.totalPayRateMinL10N
          : `${j.totalPayRateMinL10N}-${j.totalPayRateMaxL10N}`
        : null,
    description: j.tagLine || null,
    url: `https://www.jobsatamazon.co.uk/app#/jobDetail?jobId=${encodeURIComponent(j.jobId)}&locale=en-GB`,
    posted_at: null,
    source: "json",
    raw: j,
  };
}

/**
 * One fresh, human-shaped visit: launch → navigate → wait for the page's own
 * search response → close. No replay, no long-lived session.
 */
async function scrapeOnce(): Promise<ScrapedJob[]> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: process.env.SCRAPER_HEADLESS !== "false",
  });

  try {
    const context = await browser.newContext({
      userAgent: pickUserAgent(),
      locale: "en-GB",
      geolocation: { latitude: UK_DEFAULT_GEO.lat, longitude: UK_DEFAULT_GEO.lng },
      permissions: ["geolocation"],
    });
    const page = await context.newPage();

    const responsePromise = page
      .waitForResponse(
        (res) => {
          if (res.request().method() !== "POST") return false;
          if (!res.url().includes("/graphql")) return false;
          const postData = res.request().postData();
          return !!postData && postData.includes("searchJobCardsByLocation");
        },
        { timeout: 45000 }
      )
      .catch(() => null);

    const url = "https://www.jobsatamazon.co.uk/app#/jobSearch?locale=en-GB";
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 }).catch((e) => {
      console.warn("scrapeOnce: goto() did not settle cleanly", e);
    });

    const response = await responsePromise;
    if (!response) {
      console.warn(
        "scrapeOnce: never observed a searchJobCardsByLocation response on this visit — " +
          "page may be blocked, or the app no longer fires that query on load. " +
          "Run with SCRAPER_HEADLESS=false locally to inspect."
      );
      return [];
    }

    if (!response.ok()) {
      console.warn(`scrapeOnce: search response came back with status ${response.status()}`);
      return [];
    }

    let json: any;
    try {
      json = await response.json();
    } catch (e) {
      console.warn("scrapeOnce: search response was not valid JSON", e);
      return [];
    }

    const looksLikeBlock =
      !!json?.errors && JSON.stringify(json.errors).match(/unauthoriz|forbidden|waf|token|expired/i);
    if (looksLikeBlock) {
      console.warn("scrapeOnce: search response indicates a block/auth failure", json.errors);
      return [];
    }

    const cards: UKJobCard[] = json?.data?.searchJobCardsByLocation?.jobCards ?? [];
    return cards.map(normalizeUKJobCard);
  } finally {
    await browser.close().catch(() => {
      // already gone — fine
    });
  }
}

// ============================================================================
// Public entry point — same shape as before, so callers don't need to change.
// `queries` is currently unused for actual filtering (see note at top of
// file) but kept in the signature so broadcast.server.ts doesn't need to
// change. Per-subscriber filtering still happens downstream.
// ============================================================================

export async function scrapeAll(
  _queries: { keyword: string | null; city: string | null }[]
): Promise<ScrapedJob[]> {
  try {
    return await scrapeOnce();
  } catch (e) {
    console.error("scrapeAll: visit failed", e);
    return [];
  }
}

// Kept for API compatibility with any existing callers/shutdown hooks — this
// version has no long-lived session to close, so it's a no-op.
export async function closeScraperSession() {
  // no-op: sessions are no longer kept warm between polls
}