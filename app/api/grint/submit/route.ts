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

// Confirmed selectors from live DOM inspection
const GRINT_USERNAME = "#usernameLogin";
const GRINT_PASSWORD = "#pwdLogin";
const GRINT_SUBMIT_LOGIN = "#submit-form-login";

export async function POST(req: NextRequest) {
  let payload: SubmitPayload;
  try { payload = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const { email, password, date, courseName, tee, holes, practiceRound } = payload;
  if (!email || !password)
    return NextResponse.json({ ok: false, error: "Missing credentials" }, { status: 400 });

  let chromium: typeof import("playwright").chromium;
  try { const pw = await import("playwright"); chromium = pw.chromium; }
  catch { return NextResponse.json({ ok: false, error: "Browser not available. Use CSV download." }, { status: 503 }); }

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
  const page = await ctx.newPage();

  try {
    // ── 1. Navigate to add-score (redirects to /passthru when logged out) ─────
    await page.goto("https://thegrint.com/score/add_full_score/", {
      waitUntil: "networkidle", timeout: 30000,
    });

    // ── 2. Log in if redirected to /passthru ──────────────────────────────────
    if (page.url().includes("passthru")) {
      // Wait for React to mount the form
      try {
        await page.waitForSelector(GRINT_USERNAME, { state: "visible", timeout: 8000 });
      } catch {
        // Force-reveal if still hidden
        await page.evaluate(() => {
          ["usernameLogin", "pwdLogin", "submit-form-login"].forEach(id => {
            let node: HTMLElement | null = document.getElementById(id);
            while (node && node !== document.body) {
              node.style.cssText += ";display:block!important;visibility:visible!important;opacity:1!important;";
              node = node.parentElement;
            }
          });
        });
        await page.waitForTimeout(500);
      }

      await page.fill(GRINT_USERNAME, email);
      await page.fill(GRINT_PASSWORD, password);
      await page.click(GRINT_SUBMIT_LOGIN);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(3000);

      if (page.url().includes("passthru")) {
        await browser.close();
        return NextResponse.json({ ok: false, error: "Login failed — check your TheGrint username and password." }, { status: 401 });
      }

      // Back to add-score now that we're logged in
      await page.goto("https://thegrint.com/score/add_full_score/", {
        waitUntil: "networkidle", timeout: 20000,
      });
      await page.waitForTimeout(1500);
    }

    // ── 3. Fill date (selects: year / month / date, values zero-padded) ───────
    const [yyyy, mm, dd] = date.split("-");
    await page.selectOption('select[name="year"]', yyyy).catch(() => {});
    await page.selectOption('select[name="month"]', mm).catch(() => {});    // "05"
    await page.selectOption('select[name="date"]', dd).catch(() => {});     // "23"

    // ── 4. Fill course + wait for autocomplete ────────────────────────────────
    await page.fill("#ucourse", courseName);
    await page.waitForTimeout(2000);
    // Click the first autocomplete suggestion
    for (const sel of [".ui-menu-item", '[role="option"]', ".autocomplete-suggestion", "li.ui-menu-item"]) {
      const s = await page.$(sel);
      if (s) { await s.click(); break; }
    }
    await page.waitForTimeout(1000);

    // ── 5. Select tee (populates after course is chosen) ──────────────────────
    await page.waitForTimeout(500);
    const teeOptions = await page.evaluate(() =>
      Array.from(document.querySelectorAll('select[name="tees"] option'))
        .map(o => ({ v: (o as HTMLOptionElement).value, t: o.textContent?.trim() ?? "" }))
    ) as { v: string; t: string }[];
    const teeMatch = teeOptions.find(o =>
      o.t.toLowerCase().includes(tee.toLowerCase()) || tee.toLowerCase().includes(o.t.toLowerCase())
    );
    if (teeMatch?.v) await page.selectOption('select[name="tees"]', teeMatch.v).catch(() => {});

    // ── 6. Select round type ──────────────────────────────────────────────────
    const holesPlayed = holes.length;
    const roundVal = holesPlayed <= 9 ? (holes[0]?.hole <= 9 ? "F9" : "B9") : "18";
    await page.selectOption('select[name="round"]', roundVal).catch(() => {});

    // ── 7. Fill hole scores, putts, penalties ─────────────────────────────────
    for (const h of holes) {
      const n = h.hole;
      if (h.score) await page.fill(`input[name="scH${n}"]`, String(h.score)).catch(() => {});
      if (h.putts) await page.fill(`input[name="ptH${n}"]`, String(h.putts)).catch(() => {});
      if (h.penalties) await page.fill(`input[name="pH${n}"]`, h.penalties).catch(() => {});
    }

    // ── 8. Practice round checkbox ────────────────────────────────────────────
    if (practiceRound) {
      const pr = await page.$("#practice_score");
      if (pr && !await pr.isChecked()) await pr.check().catch(() => {});
    }

    // ── 9. Submit (it's an anchor, not a button) ──────────────────────────────
    await page.click('a:has-text("Submit")').catch(() => {});
    await page.waitForTimeout(3000);

    // ── 10. Dismiss pro-membership upsell modal if it appears ─────────────────
    const notNow = await page.$('a:has-text("Not now"), a:has-text("No thanks"), a[href*="add_full_score/"]');
    if (notNow) await notNow.click().catch(() => {});

    await browser.close();
    return NextResponse.json({ ok: true, message: "Score submitted to TheGrint — check your account to confirm." });

  } catch (err: unknown) {
    const url = page.url();
    await browser.close();
    return NextResponse.json({
      ok: false,
      error: `${err instanceof Error ? err.message : String(err)} (at ${url})`,
    }, { status: 500 });
  }
}
