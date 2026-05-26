import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

type HoleEntry = {
  hole: number; par: number; yards: number; stroke_index: number;
  score: number; ags: number; putts: number; penalties: string; tee_accuracy: string;
};

type SubmitPayload = {
  email: string; password: string; date: string;
  courseName: string; tee: string; holes: HoleEntry[]; practiceRound: boolean;
};

const GRINT_USERNAME = "#usernameLogin";
const GRINT_PASSWORD = "#pwdLogin";
const GRINT_SUBMIT_LOGIN = "#submit-form-login";

async function launchBrowser() {
  // @sparticuz/chromium + puppeteer-core (works on Vercel/serverless)
  try {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = (await import("puppeteer-core")).default;
    const executablePath = await chromium.executablePath();
    return await puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: true,
      defaultViewport: { width: 1280, height: 900 },
    });
  } catch (e1) {
    // Fall back to local playwright (dev only)
    try {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({
        headless: true,
        args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
      });
      return { _playwright: browser } as any;
    } catch (e2) {
      throw new Error(`sparticuz: ${e1} | playwright: ${e2}`);
    }
  }
}

export async function POST(req: NextRequest) {
  let payload: SubmitPayload;
  try { payload = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const { email, password, date, courseName, tee, holes, practiceRound } = payload;
  if (!email || !password)
    return NextResponse.json({ ok: false, error: "Missing credentials" }, { status: 400 });

  let rawBrowser: any;
  try {
    rawBrowser = await launchBrowser();
  } catch (err) {
    return NextResponse.json({ ok: false, error: `Browser unavailable: ${err}` }, { status: 503 });
  }

  // Normalise: if we got a playwright browser (dev fallback), use its API directly
  const isPlaywright = rawBrowser._playwright !== undefined;
  const playwrightBrowser = isPlaywright ? rawBrowser._playwright : null;
  const puppeteerBrowser = isPlaywright ? null : rawBrowser;

  async function newPage() {
    if (playwrightBrowser) {
      const ctx = await playwrightBrowser.newContext({
        viewport: { width: 1280, height: 900 },
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      });
      await ctx.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => false }); });
      return ctx.newPage();
    }
    const p = await puppeteerBrowser.newPage();
    await p.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
    await p.evaluateOnNewDocument(() => { Object.defineProperty(navigator, "webdriver", { get: () => false }); });
    return p;
  }

  async function closeBrowser() {
    try { isPlaywright ? await playwrightBrowser.close() : await puppeteerBrowser.close(); } catch {}
  }

  // Puppeteer-compatible helpers
  async function goto(page: any, url: string, opts?: any) {
    if (isPlaywright) return page.goto(url, opts);
    return page.goto(url, { waitUntil: opts?.waitUntil === "networkidle" ? "networkidle2" : (opts?.waitUntil ?? "load"), timeout: opts?.timeout });
  }
  async function waitForSelector(page: any, sel: string, opts?: any) {
    if (isPlaywright) return page.waitForSelector(sel, opts);
    return page.waitForSelector(sel, { visible: opts?.state === "visible", timeout: opts?.timeout });
  }
  async function fill(page: any, sel: string, val: string) {
    if (isPlaywright) return page.fill(sel, val);
    await page.$eval(sel, (el: any, v: string) => { el.value = ""; el.value = v; }, val);
  }
  async function selectOption(page: any, sel: string, val: string) {
    if (isPlaywright) return page.selectOption(sel, val).catch(() => {});
    await page.select(sel, val).catch(() => {});
  }
  async function waitMs(page: any, ms: number) {
    await new Promise(r => setTimeout(r, ms));
  }
  async function evalClick(page: any, text: string) {
    if (isPlaywright) return page.click(`a:has-text("${text}"), button:has-text("${text}")`).catch(() => {});
    await page.evaluate((t: string) => {
      const el = [...document.querySelectorAll("a,button")].find(e => e.textContent?.includes(t));
      if (el) (el as HTMLElement).click();
    }, text).catch(() => {});
  }

  const page = await newPage();

  try {
    // ── 1. Navigate to add-score ──────────────────────────────────────────────
    await goto(page, "https://thegrint.com/score/add_full_score/", { waitUntil: "networkidle", timeout: 30000 });

    // ── 2. Log in if redirected ───────────────────────────────────────────────
    if (page.url().includes("passthru")) {
      try {
        await waitForSelector(page, GRINT_USERNAME, { state: "visible", timeout: 8000 });
      } catch {
        await page.evaluate(() => {
          ["usernameLogin", "pwdLogin", "submit-form-login"].forEach(id => {
            let node: HTMLElement | null = document.getElementById(id);
            while (node && node !== document.body) {
              node.style.cssText += ";display:block!important;visibility:visible!important;opacity:1!important;";
              node = node.parentElement;
            }
          });
        });
        await waitMs(page, 500);
      }

      await fill(page, GRINT_USERNAME, email);
      await fill(page, GRINT_PASSWORD, password);
      if (isPlaywright) await page.click(GRINT_SUBMIT_LOGIN);
      else await page.click(GRINT_SUBMIT_LOGIN);
      await waitMs(page, 3000);

      if (page.url().includes("passthru")) {
        await closeBrowser();
        return NextResponse.json({ ok: false, error: "Login failed — check your TheGrint username and password." }, { status: 401 });
      }

      await goto(page, "https://thegrint.com/", { waitUntil: "domcontentloaded", timeout: 20000 });
      await waitMs(page, 3000);
      await goto(page, "https://thegrint.com/score/add_full_score/", { waitUntil: "networkidle", timeout: 20000 });
      await waitMs(page, 1500);
    }

    // ── 3. Fill date ──────────────────────────────────────────────────────────
    const [yyyy, mm, dd] = date.split("-");
    await selectOption(page, 'select[name="year"]', yyyy);
    await selectOption(page, 'select[name="month"]', mm);
    await selectOption(page, 'select[name="date"]', dd);

    // ── 4. Fill course ────────────────────────────────────────────────────────
    await page.click("#ucourse");
    await waitMs(page, 400);
    await page.keyboard.press("Control+a");
    await waitMs(page, 50);
    await page.keyboard.type(courseName, { delay: 100 });
    await waitMs(page, 300);

    try {
      await waitForSelector(page, ".suggestion", { state: "visible", timeout: 7000 });
      const firstResult = await page.$(".suggestion");
      if (firstResult) await firstResult.click();
    } catch {}
    await waitMs(page, 2500);

    // ── 5. Select tee ─────────────────────────────────────────────────────────
    let teeOptions: { v: string; t: string }[] = [];
    for (let i = 0; i < 8; i++) {
      teeOptions = await page.evaluate(() =>
        Array.from(document.querySelectorAll('select[name="tees"] option'))
          .map(o => ({ v: (o as HTMLOptionElement).value, t: o.textContent?.trim() ?? "" }))
          .filter(o => o.v !== "")
      ) as { v: string; t: string }[];
      if (teeOptions.length > 0) break;
      await waitMs(page, 500);
    }
    const teeMatch = teeOptions.find(o =>
      o.t.toLowerCase().includes(tee.toLowerCase()) || tee.toLowerCase().includes(o.t.toLowerCase())
    ) ?? teeOptions[0];
    if (teeMatch?.v) await selectOption(page, 'select[name="tees"]', teeMatch.v);

    // ── 6. Select round type ──────────────────────────────────────────────────
    const is9Hole = holes.length <= 9;
    const isBack9 = is9Hole && holes[0]?.hole > 9;
    if (is9Hole) {
      for (let attempt = 0; attempt < 3; attempt++) {
        await selectOption(page, 'select[name="round"]', isBack9 ? "B9" : "F9");
        await waitMs(page, 800);
        const cur = await page.$eval('select[name="round"]', (el: any) => el.value).catch(() => "");
        if (cur !== "18") break;
      }
      await waitMs(page, 2000);
    }

    // ── 7. Fill scores ────────────────────────────────────────────────────────
    for (const h of holes) {
      const n = h.hole;
      if (h.score) await fill(page, `input[name="scH${n}"]`, String(h.score)).catch(() => {});
      if (h.putts) await fill(page, `input[name="ptH${n}"]`, String(h.putts)).catch(() => {});
      if (h.penalties) await fill(page, `input[name="pH${n}"]`, h.penalties).catch(() => {});
    }

    // ── 8. Practice round ─────────────────────────────────────────────────────
    if (practiceRound) {
      const pr = await page.$("#practice_score");
      if (pr) {
        const checked = isPlaywright ? await pr.isChecked() : await page.$eval("#practice_score", (el: any) => el.checked).catch(() => false);
        if (!checked) await pr.click().catch(() => {});
      }
    }

    // ── 9. Submit ─────────────────────────────────────────────────────────────
    await evalClick(page, "Submit");
    await waitMs(page, 2000);
    try { await evalClick(page, "Not now"); } catch {}
    await waitMs(page, 4000);

    const finalUrl = page.url();
    await closeBrowser();

    return NextResponse.json({
      ok: true,
      message: !finalUrl.includes("add_full_score")
        ? "Score submitted and saved to TheGrint."
        : "Score submitted to TheGrint — verify it appeared in your score history.",
    });

  } catch (err: unknown) {
    const url = page.url();
    await closeBrowser();
    return NextResponse.json({
      ok: false,
      error: `${err instanceof Error ? err.message : String(err)} (at ${url})`,
    }, { status: 500 });
  }
}
