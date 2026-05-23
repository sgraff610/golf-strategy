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

const EMAIL_SELS = [
  'input[name="user[email]"]',
  'input[name="email"]',
  'input[name="session[email]"]',
  'input[type="email"]',
  'input[placeholder*="email" i]',
  'input[autocomplete="email"]',
  'input[autocomplete="username"]',
  'input[id*="email"]',
];

const PASS_SELS = [
  'input[name="user[password]"]',
  'input[name="password"]',
  'input[name="session[password]"]',
  'input[type="password"]',
];

async function tryFill(page: import("playwright").Page, selectors: string[], value: string) {
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
    return NextResponse.json({ ok: false, error: "Browser not available. Use CSV download instead." }, { status: 503 });
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();

  try {
    // ── 1. Go directly to the add-score page; TheGrint will redirect to login ──
    await page.goto("https://thegrint.com/score/add_full_score/", {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    });
    await page.waitForTimeout(1500); // let JS settle

    const landedUrl = page.url();

    // ── 2. If redirected to login, fill credentials ────────────────────────────
    const needsLogin =
      landedUrl.includes("sign_in") ||
      landedUrl.includes("login") ||
      landedUrl.includes("signin") ||
      !!(await page.$('input[type="password"]'));

    if (needsLogin) {
      // ── Diagnostic: return /passthru DOM structure so we can target the right elements
      const diag = await page.evaluate(() => ({
        inputs: Array.from(document.querySelectorAll("input")).map(el => ({
          type: el.type, name: el.name, id: el.id,
          placeholder: el.placeholder,
          visible: (el as HTMLElement).offsetParent !== null,
        })),
        buttons: Array.from(document.querySelectorAll("button, input[type=submit]")).map(el => ({
          tag: el.tagName,
          type: (el as HTMLButtonElement).type,
          text: el.textContent?.trim().substring(0, 80),
          id: el.id,
          visible: (el as HTMLElement).offsetParent !== null,
        })),
      }));
      await browser.close();
      return NextResponse.json({ ok: false, diag }, { status: 422 });

      const jsFocus = async (selectors: string[]) => {
        return page.evaluate((sels: string[]) => {
          for (const sel of sels) {
            const el = document.querySelector(sel) as HTMLInputElement | null;
            if (el) { el.focus(); return true; }
          }
          return false;
        }, selectors);
      };

      // ── Step A: type email then press Enter ────────────────────────────────────
      const emailFocused = await jsFocus(EMAIL_SELS);
      if (!emailFocused) {
        await browser.close();
        return NextResponse.json({
          ok: false,
          error: `v6 — login form not found at: ${landedUrl} (${await page.title()})`,
        }, { status: 422 });
      }
      await page.keyboard.type(email, { delay: 40 });
      await page.waitForTimeout(300);
      await page.keyboard.press("Enter");
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(2500);

      // ── Step B: type password then press Enter ─────────────────────────────────
      const urlAfterEmail = page.url();
      const passFocused = await jsFocus(PASS_SELS);
      if (!passFocused) {
        await browser.close();
        return NextResponse.json({
          ok: false,
          error: `v6 — password field not found at: ${urlAfterEmail} (${await page.title()})`,
        }, { status: 422 });
      }
      await page.keyboard.type(password, { delay: 40 });
      await page.waitForTimeout(300);
      await page.keyboard.press("Enter");
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(2500);

      // Check login succeeded
      const afterUrl = page.url();
      if (afterUrl.includes("sign_in") || afterUrl.includes("login") || afterUrl.includes("passthru")) {
        const pageTitle = await page.title();
        await browser.close();
        return NextResponse.json({
          ok: false,
          error: `v6 — still at ${afterUrl} ("${pageTitle}") after password submit. URL after email step was: ${urlAfterEmail}`,
        }, { status: 401 });
      }

      // Navigate to add-score now that we're logged in
      await page.goto("https://thegrint.com/score/add_full_score/", {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      await page.waitForTimeout(1500);
    }

    // ── 3. Confirm we're on the score entry page ──────────────────────────────
    const scoreUrl = page.url();
    if (!scoreUrl.includes("score")) {
      await browser.close();
      return NextResponse.json({
        ok: false,
        error: `Unexpected page after login: ${scoreUrl}`,
      }, { status: 422 });
    }

    // ── 4. Click "Hole by Hole" tab ───────────────────────────────────────────
    for (const sel of [
      'a:has-text("Hole by Hole")',
      '[data-tab="hole_by_hole"]',
      'a[href*="hole"]',
      'li:has-text("Hole by Hole")',
    ]) {
      const el = await page.$(sel);
      if (el) { await el.click(); await page.waitForTimeout(700); break; }
    }

    // ── 5. Fill date ──────────────────────────────────────────────────────────
    const [yyyy, mm, dd] = date.split("-");
    await page.selectOption('select[name*="year"], #score_year', yyyy).catch(() => {});
    await page.selectOption('select[name*="month"], #score_month', String(parseInt(mm))).catch(() => {});
    await page.selectOption('select[name*="day"], #score_day', String(parseInt(dd))).catch(() => {});

    // ── 6. Fill course ────────────────────────────────────────────────────────
    for (const sel of [
      'input[placeholder*="golf course" i]',
      'input[placeholder*="course" i]',
      'input[name*="course"]',
      'input[id*="course"]',
      'input[class*="course"]',
    ]) {
      const el = await page.$(sel);
      if (el) {
        await el.fill(courseName);
        await page.waitForTimeout(1800);
        for (const sug of ['.autocomplete-suggestion', '.ui-menu-item', '[role="option"]', '[class*="suggestion"]', 'li[data-value]']) {
          const s = await page.$(sug);
          if (s) { await s.click(); break; }
        }
        break;
      }
    }

    // ── 7. Select tee ─────────────────────────────────────────────────────────
    await page.waitForTimeout(800);
    for (const sel of ['select[name*="tee"]', '#score_tee_id', 'select[id*="tee"]']) {
      const el = await page.$(sel);
      if (el) {
        const options = await el.evaluate(node =>
          Array.from((node as HTMLSelectElement).options).map(o => ({ v: o.value, t: o.text }))
        ) as { v: string; t: string }[];
        const match = options.find(o =>
          o.t.toLowerCase().includes(tee.toLowerCase()) ||
          tee.toLowerCase().includes(o.t.toLowerCase())
        );
        if (match) await page.selectOption(sel, match.v);
        break;
      }
    }

    // ── 8. Fill hole scores ───────────────────────────────────────────────────
    await page.waitForTimeout(800);
    for (const h of holes) {
      const n = h.hole;
      await tryFill(page, [
        `input[name*="score"][name*="${n}"]`,
        `input[name*="hole_${n}"]`,
        `#score_h${n}`, `#hole_${n}_score`,
        `input[data-hole="${n}"]`,
        `.hole-${n} input[name*="score"]`,
      ], String(h.score));

      if (h.putts) {
        await tryFill(page, [
          `input[name*="putt"][name*="${n}"]`,
          `#putt_h${n}`, `#hole_${n}_putts`,
          `.hole-${n} input[name*="putt"]`,
        ], String(h.putts));
      }

      if (h.penalties) {
        await tryFill(page, [
          `input[name*="penalt"][name*="${n}"]`,
          `#penalty_h${n}`, `#hole_${n}_penalty`,
          `.hole-${n} input[name*="penalt"]`,
        ], h.penalties);
      }
    }

    // ── 9. Practice round checkbox ────────────────────────────────────────────
    if (practiceRound) {
      const pr = await page.$('input[name*="practice"], input#score_practice, input[id*="practice"]');
      if (pr) {
        if (!await pr.isChecked()) await pr.check();
      } else {
        try { await page.locator('label', { hasText: /Practice/i }).first().click(); } catch {}
      }
    }

    // ── 10. Submit ────────────────────────────────────────────────────────────
    const submitBtn = await page.$('input[type="submit"][value*="Submit" i], button:has-text("Submit"), button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(2000);
    }

    await browser.close();
    return NextResponse.json({
      ok: true,
      message: "Score submitted to TheGrint — check your account to confirm.",
    });

  } catch (err: unknown) {
    const url = page.url();
    await browser.close();
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: `${msg} (at ${url})` }, { status: 500 });
  }
}
