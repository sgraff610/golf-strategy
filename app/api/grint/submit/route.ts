import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

type HoleEntry = {
  hole: number;
  par: number;
  yards: number;
  stroke_index: number;
  score: number;
  ags: number;
  putts: number;
  penalties: string;
  tee_accuracy: string;
};

type SubmitPayload = {
  email: string;
  password: string;
  date: string;
  courseName: string;
  tee: string;
  holes: HoleEntry[];
  practiceRound: boolean;
};

async function findAndFill(page: import("playwright").Page, selectors: string[], value: string) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) { await el.fill(value); return true; }
    } catch {}
  }
  return false;
}

export async function POST(req: NextRequest) {
  let payload: SubmitPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { email, password, date, courseName, tee, holes, practiceRound } = payload;
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "Missing credentials" }, { status: 400 });
  }

  let chromium: typeof import("playwright").chromium;
  try {
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch {
    return NextResponse.json({
      ok: false,
      error: "Browser not available. Use the CSV download instead.",
    }, { status: 503 });
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();

  try {
    // ── 1. Land on TheGrint homepage ───────────────────────────────────────────
    await page.goto("https://www.thegrint.com", { waitUntil: "domcontentloaded", timeout: 25000 });

    // ── 2. Find and click Sign In ──────────────────────────────────────────────
    const signinSelectors = [
      'a[href*="sign_in"]',
      'a[href*="login"]',
      'a:has-text("Sign In")',
      'a:has-text("Log In")',
      'a:has-text("Login")',
      'button:has-text("Sign In")',
    ];
    let clickedSignin = false;
    for (const sel of signinSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await el.click();
          clickedSignin = true;
          break;
        }
      } catch {}
    }

    // If no sign-in link, try navigating directly to common login paths
    if (!clickedSignin) {
      for (const path of ["/users/sign_in", "/login", "/sign-in", "/signin"]) {
        try {
          await page.goto(`https://www.thegrint.com${path}`, { waitUntil: "domcontentloaded", timeout: 10000 });
          break;
        } catch {}
      }
    }

    // ── 3. Wait for any email/username input to appear ─────────────────────────
    let emailInput: import("playwright").ElementHandle | null = null;
    const emailSelectors = [
      'input[name="user[email]"]',
      'input[name="email"]',
      'input[name="session[email]"]',
      'input[type="email"]',
      'input[placeholder*="email" i]',
      'input[id*="email"]',
      'input[autocomplete="email"]',
      'input[autocomplete="username"]',
    ];

    // Wait up to 10s for any of them
    for (let attempt = 0; attempt < 20; attempt++) {
      for (const sel of emailSelectors) {
        const el = await page.$(sel);
        if (el) { emailInput = el; break; }
      }
      if (emailInput) break;
      await page.waitForTimeout(500);
    }

    if (!emailInput) {
      const url = page.url();
      const title = await page.title();
      await browser.close();
      return NextResponse.json({
        ok: false,
        error: `Could not find login form. Page: "${title}" (${url}). TheGrint may have changed their login page — please use CSV download instead.`,
      }, { status: 422 });
    }

    // ── 4. Fill credentials ────────────────────────────────────────────────────
    await emailInput.fill(email);

    const passSelectors = [
      'input[name="user[password]"]',
      'input[name="password"]',
      'input[name="session[password]"]',
      'input[type="password"]',
    ];
    await findAndFill(page, passSelectors, password);

    // ── 5. Submit login ────────────────────────────────────────────────────────
    const submitSelectors = [
      'input[type="submit"]',
      'button[type="submit"]',
      'button:has-text("Sign In")',
      'button:has-text("Log In")',
      'button:has-text("Login")',
    ];
    for (const sel of submitSelectors) {
      const el = await page.$(sel);
      if (el) { await el.click(); break; }
    }

    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(2000);

    // Check for login error
    const errEl = await page.$('.alert, .flash, [class*="error"], [class*="alert"]');
    if (errEl) {
      const txt = await errEl.textContent();
      if (txt && /invalid|incorrect|wrong|failed/i.test(txt)) {
        await browser.close();
        return NextResponse.json({ ok: false, error: `Login failed: ${txt.trim()}` }, { status: 401 });
      }
    }

    // Confirm we're logged in (no longer on a login page)
    const currentUrl = page.url();
    if (currentUrl.includes("sign_in") || currentUrl.includes("login")) {
      await browser.close();
      return NextResponse.json({ ok: false, error: "Login did not succeed — check your TheGrint email and password." }, { status: 401 });
    }

    // ── 6. Navigate to Add Score ───────────────────────────────────────────────
    const scorePaths = [
      "https://www.thegrint.com/golf-handicap/score-entry",
      "https://www.thegrint.com/scores/new",
      "https://www.thegrint.com/golf-handicap/add-score",
    ];
    for (const path of scorePaths) {
      try {
        await page.goto(path, { waitUntil: "domcontentloaded", timeout: 15000 });
        // If we didn't get redirected back to login, assume success
        if (!page.url().includes("sign_in") && !page.url().includes("login")) break;
      } catch {}
    }

    await page.waitForTimeout(1000);

    // Click "Hole by Hole" tab
    for (const sel of ['a:has-text("Hole by Hole")', '[data-tab="hole_by_hole"]', 'a[href*="hole"]']) {
      const el = await page.$(sel);
      if (el) { await el.click(); await page.waitForTimeout(600); break; }
    }

    // ── 7. Fill date ───────────────────────────────────────────────────────────
    const [yyyy, mm, dd] = date.split("-");
    await page.selectOption('select[name*="year"], #score_year', yyyy).catch(() => {});
    await page.selectOption('select[name*="month"], #score_month', String(parseInt(mm))).catch(() => {});
    await page.selectOption('select[name*="day"], #score_day', String(parseInt(dd))).catch(() => {});

    // ── 8. Fill course ─────────────────────────────────────────────────────────
    const courseSelectors = [
      'input[placeholder*="golf course" i]',
      'input[placeholder*="course" i]',
      'input[name*="course"]',
      'input[id*="course"]',
    ];
    for (const sel of courseSelectors) {
      const el = await page.$(sel);
      if (el) {
        await el.fill(courseName);
        await page.waitForTimeout(1500);
        const suggestion = await page.$('.autocomplete-suggestion, .ui-menu-item, [role="option"], [class*="suggestion"]');
        if (suggestion) await suggestion.click();
        break;
      }
    }

    // ── 9. Select tee ─────────────────────────────────────────────────────────
    await page.waitForTimeout(800);
    const teeSelectors = ['select[name*="tee"]', '#score_tee_id', 'select[id*="tee"]'];
    for (const sel of teeSelectors) {
      const el = await page.$(sel);
      if (el) {
        const options = await el.evaluate(node =>
          Array.from((node as HTMLSelectElement).options).map(o => ({ v: o.value, t: o.text }))
        );
        const match = (options as { v: string; t: string }[]).find(o =>
          o.t.toLowerCase().includes(tee.toLowerCase()) || tee.toLowerCase().includes(o.t.toLowerCase())
        );
        if (match) await page.selectOption(sel, match.v);
        break;
      }
    }

    // ── 10. Fill hole scores ───────────────────────────────────────────────────
    await page.waitForTimeout(800);
    for (const h of holes) {
      const n = h.hole;
      await findAndFill(page, [
        `input[name*="score"][name*="${n}"]`,
        `input[name*="hole_${n}"]`,
        `#score_h${n}`, `#hole_${n}_score`,
        `input[data-hole="${n}"]`,
        `.hole-${n} input[name*="score"]`,
      ], String(h.score));

      if (h.putts) {
        await findAndFill(page, [
          `input[name*="putt"][name*="${n}"]`,
          `#putt_h${n}`, `#hole_${n}_putts`,
          `.hole-${n} input[name*="putt"]`,
        ], String(h.putts));
      }

      if (h.penalties) {
        await findAndFill(page, [
          `input[name*="penalt"][name*="${n}"]`,
          `#penalty_h${n}`, `#hole_${n}_penalty`,
          `.hole-${n} input[name*="penalt"]`,
        ], h.penalties);
      }
    }

    // ── 11. Practice round checkbox ────────────────────────────────────────────
    if (practiceRound) {
      const practiced = await page.$('input[name*="practice"], input#score_practice, input[id*="practice"]');
      if (practiced) {
        if (!await practiced.isChecked()) await practiced.check();
      } else {
        // Fallback: click the label
        try {
          await page.locator('label', { hasText: /Practice/i }).first().click();
        } catch {}
      }
    }

    // ── 12. Submit ─────────────────────────────────────────────────────────────
    const submitBtn = await page.$('input[type="submit"][value*="Submit"], button:has-text("Submit"), button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(2000);
    }

    const finalUrl = page.url();
    await browser.close();

    return NextResponse.json({
      ok: true,
      message: "Score submitted to TheGrint. Check your TheGrint account to confirm it appeared.",
      url: finalUrl,
    });

  } catch (err: unknown) {
    const url = page.url();
    await browser.close();
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
