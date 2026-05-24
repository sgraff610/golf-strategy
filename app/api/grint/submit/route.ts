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
      try {
        await page.waitForSelector(GRINT_USERNAME, { state: "visible", timeout: 8000 });
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

      // Pass through the home page so the SPA fully loads user profile/Pro status.
      // Going straight to add-score after login leaves the session without Pro flags.
      await page.goto("https://thegrint.com/", { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(3000);
      await page.goto("https://thegrint.com/score/add_full_score/", {
        waitUntil: "networkidle", timeout: 20000,
      });
      await page.waitForTimeout(1500);
    }

    // ── 3. Fill date ──────────────────────────────────────────────────────────
    const [yyyy, mm, dd] = date.split("-");
    await page.selectOption('select[name="year"]', yyyy).catch(() => {});
    await page.selectOption('select[name="month"]', mm).catch(() => {});
    await page.selectOption('select[name="date"]', dd).catch(() => {});

    // ── 4. Fill course + wait for autocomplete ────────────────────────────────
    // Ctrl+A replaces the placeholder text without using locator.clear(), which
    // breaks jQuery's internal autocomplete state.
    await page.click("#ucourse");
    await page.waitForTimeout(400);
    await page.keyboard.press("Control+a");
    await page.waitForTimeout(50);
    await page.keyboard.type(courseName, { delay: 100 });
    await page.waitForTimeout(300);

    try {
      // TheGrint renders autocomplete results as div.suggestion (not jQuery UI)
      await page.waitForSelector(".suggestion", { state: "visible", timeout: 7000 });
      const firstResult = await page.$(".suggestion");
      if (firstResult) await firstResult.click();
    } catch { /* course not found in autocomplete */ }
    await page.waitForTimeout(2500);

    // ── 5. Select tee ─────────────────────────────────────────────────────────
    let teeOptions: { v: string; t: string }[] = [];
    for (let i = 0; i < 8; i++) {
      teeOptions = await page.evaluate(() =>
        Array.from(document.querySelectorAll('select[name="tees"] option'))
          .map(o => ({ v: (o as HTMLOptionElement).value, t: o.textContent?.trim() ?? "" }))
          .filter(o => o.v !== "")
      ) as { v: string; t: string }[];
      if (teeOptions.length > 0) break;
      await page.waitForTimeout(500);
    }
    const teeMatch = teeOptions.find(o =>
      o.t.toLowerCase().includes(tee.toLowerCase()) || tee.toLowerCase().includes(o.t.toLowerCase())
    ) ?? teeOptions[0];
    if (teeMatch?.v) await page.selectOption('select[name="tees"]', teeMatch.v).catch(() => {});

    // ── 6. Select round type ──────────────────────────────────────────────────
    // The form may re-render after course/tee selection and reset round back to "18".
    // Select the round type last, after the re-render, and verify it took.
    const is9Hole = holes.length <= 9;
    const isBack9 = is9Hole && holes[0]?.hole > 9;
    if (is9Hole) {
      const roundKeyword = isBack9 ? "back" : "front";
      // Attempt up to 3 times in case a re-render resets the value
      for (let attempt = 0; attempt < 3; attempt++) {
        await page.selectOption('select[name="round"]', { label: isBack9 ? "Back 9" : "Front 9" }).catch(async () => {
          // fall back to value-based selection
          const val = isBack9 ? "B9" : "F9";
          await page.selectOption('select[name="round"]', val).catch(() => {});
        });
        await page.waitForTimeout(800);
        const currentRound = await page.$eval('select[name="round"]', el => (el as HTMLSelectElement).value).catch(() => "");
        if (currentRound !== "18") break; // selection stuck — proceed
      }
      // Wait for the form to re-render (hides back-9 hole inputs)
      await page.waitForTimeout(2000);
    }

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

    // ── 9. Submit ─────────────────────────────────────────────────────────────
    await page.click('a:has-text("Submit"), button:has-text("Submit")').catch(() => {});
    await page.waitForTimeout(2000);

    // Dismiss any Pro upsell modal that appears
    try {
      await page.click('a:has-text("Not now")', { force: true, timeout: 2000 });
    } catch { /* no modal */ }

    await page.waitForTimeout(4000);

    const finalUrl = page.url();
    await browser.close();

    return NextResponse.json({
      ok: true,
      message: !finalUrl.includes("add_full_score")
        ? "Score submitted and saved to TheGrint."
        : "Score submitted to TheGrint — verify it appeared in your score history.",
    });

  } catch (err: unknown) {
    const url = page.url();
    await browser.close();
    return NextResponse.json({
      ok: false,
      error: `${err instanceof Error ? err.message : String(err)} (at ${url})`,
    }, { status: 500 });
  }
}
