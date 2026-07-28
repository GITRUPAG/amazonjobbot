// Server-only Amazon UK jobs scraper — warm-session polling version.
//
// Previous version launched a fresh browser and reloaded the search page on
// every scrape. That's 10-30s of overhead per cycle (browser boot + WAF
// challenge + page load) before we've even checked for a new job — way too
// slow if the goal is alerting within a couple of seconds of a posting.
//
// This version launches the browser ONCE and keeps it open. The first page
// load still has to pass the WAF challenge and mint a session, same as
// before — we don't try to fake that. But we capture the exact
// searchJobCardsByLocation request the page makes, then replay it directly
// (via fetch, executed inside the still-open page so cookies/session stay
// valid) with fresh variables on every subsequent poll. No navigation, no
// WAF challenge, no new session — just the one HTTP round trip we actually
// need, every ~2s.
//
// If a poll ever comes back looking like the session died (auth error, or
// no captured request yet), we tear down and re-mint a fresh session once,
// then retry.

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

// ============================================================================
// Geocoding (unchanged) — needed to turn a city name into the lat/lng the
// job search itself requires.
// ============================================================================

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const geocodeCache = new Map<string, { lat: number; lng: number } | null>();
const UK_DEFAULT_GEO = { lat: 52.3555, lng: -1.1743 };

async function geocodeCityUK(city: string): Promise<{ lat: number; lng: number } | null> {
  const key = city.trim().toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;

  const params = new URLSearchParams({ q: city, format: "json", countrycodes: "gb", limit: "1" });
  try {
    const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: {
        "User-Agent": "amazon-jobs-scraper/1.0 (contact: set-your-contact-here)",
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      geocodeCache.set(key, null);
      return null;
    }
    const results = (await res.json()) as { lat: string; lon: string }[];
    if (!results.length) {
      geocodeCache.set(key, null);
      return null;
    }
    const point = { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
    geocodeCache.set(key, point);
    await sleep(1000); // be polite to Nominatim's free tier
    return point;
  } catch (e) {
    console.error(`geocodeCityUK(${city}) failed`, e);
    geocodeCache.set(key, null);
    return null;
  }
}

// ============================================================================
// Warm session management
// ============================================================================

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

type CapturedRequest = {
  url: string;
  headers: Record<string, string>;
  query: string;
};

type LiveSession = {
  browser: import("playwright").Browser;
  context: import("playwright").BrowserContext;
  page: import("playwright").Page;
  captured: CapturedRequest | null;
};

let session: LiveSession | null = null;
let sessionStarting: Promise<LiveSession> | null = null;

// Headers that either can't be set manually from page.evaluate's fetch, or
// would be wrong if replayed verbatim (they change per-request or are
// managed by the browser itself).
const DROP_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "accept-encoding",
  "cookie",
  "user-agent",
]);

async function bootSession(): Promise<LiveSession> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: process.env.SCRAPER_HEADLESS !== "false" });
  const context = await browser.newContext({
    userAgent: pickUserAgent(),
    locale: "en-GB",
    geolocation: { latitude: UK_DEFAULT_GEO.lat, longitude: UK_DEFAULT_GEO.lng },
    permissions: ["geolocation"],
  });
  const page = await context.newPage();

  let captured: CapturedRequest | null = null;
  page.on("request", (req) => {
    if (captured) return;
    if (!req.url().includes("/graphql")) return;
    if (req.method() !== "POST") return;
    const postData = req.postData();
    if (!postData || !postData.includes("searchJobCardsByLocation")) return;
    try {
      const parsed = JSON.parse(postData);
      const rawHeaders = req.headers();
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawHeaders)) {
        if (!DROP_HEADERS.has(k.toLowerCase())) headers[k] = v;
      }
      captured = { url: req.url(), headers, query: parsed.query };
    } catch {
      // not JSON, or shape unexpected — ignore, we'll error out below if
      // nothing ever gets captured
    }
  });

  const url = "https://www.jobsatamazon.co.uk/app#/jobSearch?locale=en-GB";
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(4000);

  if (!captured) {
    await browser.close();
    throw new Error(
      "bootSession: never captured a searchJobCardsByLocation request. Either the WAF " +
        "challenge didn't pass, or the page no longer fires that query the same way — " +
        "run with SCRAPER_HEADLESS=false locally to watch it load."
    );
  }

  return { browser, context, page, captured };
}

async function ensureSession(): Promise<LiveSession> {
  if (session && !session.page.isClosed()) return session;
  if (sessionStarting) return sessionStarting;

  sessionStarting = bootSession()
    .then((s) => {
      session = s;
      sessionStarting = null;
      return s;
    })
    .catch((e) => {
      sessionStarting = null;
      throw e;
    });

  return sessionStarting;
}

async function invalidateSession() {
  if (session) {
    try {
      await session.browser.close();
    } catch {
      // already gone — fine
    }
  }
  session = null;
}

// ============================================================================
// Polling — replay the captured request with fresh variables, no navigation.
// ============================================================================

async function pollGraphQL(
  live: LiveSession,
  variables: Record<string, any>
): Promise<{ data?: any; errors?: any }> {
  const { page, captured } = live;
  if (!captured) throw new Error("pollGraphQL: no captured request on this session");

  return page.evaluate(
    async ({ url, headers, query, variables }) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
        credentials: "include",
      });
      return res.json();
    },
    { url: captured.url, headers: captured.headers, query: captured.query, variables }
  );
}

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

async function pollOneQuery(
  keyword: string | null,
  city: string | null,
  radiusMiles = 30,
  isRetry = false
): Promise<ScrapedJob[]> {
  let live: LiveSession;
  try {
    live = await ensureSession();
  } catch (e) {
    console.error("pollOneQuery: could not establish a session", e);
    return [];
  }

  let geo = UK_DEFAULT_GEO;
  let distance = 300; // UK-wide fallback radius when no city given
  if (city && city.trim()) {
    const point = await geocodeCityUK(city);
    if (point) {
      geo = point;
      distance = radiusMiles;
    }
  }

  const variables = {
    searchJobRequest: {
      locale: "en-GB",
      country: "United Kingdom",
      keyWords: keyword ?? "",
      equalFilters: [],
      containFilters: [{ key: "isPrivateSchedule", val: ["true", "false"] }],
      rangeFilters: [],
      orFilters: [],
      dateFilters: [],
      sorters: [],
      pageSize: 100,
      geoQueryClause: { lat: geo.lat, lng: geo.lng, unit: "mi", distance },
      consolidateSchedule: true,
    },
  };

  let json: { data?: any; errors?: any };
  try {
    json = await pollGraphQL(live, variables);
  } catch (e) {
    // page.evaluate throwing usually means the page/context died underneath us.
    if (isRetry) {
      console.error("pollOneQuery: poll failed even after re-minting session", e);
      return [];
    }
    console.warn("pollOneQuery: poll failed, re-minting session and retrying once", e);
    await invalidateSession();
    return pollOneQuery(keyword, city, radiusMiles, true);
  }

  const looksLikeAuthFailure =
    !!json?.errors &&
    JSON.stringify(json.errors).match(/unauthoriz|forbidden|token|expired/i);

  if (looksLikeAuthFailure) {
    if (isRetry) {
      console.error("pollOneQuery: session still unauthorized after re-mint", json.errors);
      return [];
    }
    console.warn("pollOneQuery: session looks expired, re-minting and retrying once");
    await invalidateSession();
    return pollOneQuery(keyword, city, radiusMiles, true);
  }

  const cards: UKJobCard[] = json?.data?.searchJobCardsByLocation?.jobCards ?? [];
  return cards.map(normalizeUKJobCard);
}

// ============================================================================
// Public entry point — same shape as before, so callers don't need to change.
// ============================================================================

export async function scrapeAll(
  queries: { keyword: string | null; city: string | null }[]
): Promise<ScrapedJob[]> {
  const list = queries.length > 0 ? queries : [{ keyword: null, city: null }];
  const out: ScrapedJob[] = [];
  const seen = new Set<string>();

  for (const q of list) {
    let jobs: ScrapedJob[] = [];
    try {
      jobs = await pollOneQuery(q.keyword, q.city);
    } catch (e) {
      console.error("scrapeAll: query failed", q, e);
    }
    for (const j of jobs) {
      if (!seen.has(j.external_id)) {
        seen.add(j.external_id);
        out.push(j);
      }
    }
  }

  return out;
}

// Exposed for a graceful shutdown hook if you want one (not required — the
// process exiting cleans up the browser anyway).
export async function closeScraperSession() {
  await invalidateSession();
}