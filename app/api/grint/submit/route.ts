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
  date: string;         // "YYYY-MM-DD"
  courseName: string;
  tee: string;
  holes: HoleEntry[];
  practiceRound: boolean;
};

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
      error: "Browser automation not available in this environment. Use the CSV download instead.",
    }, { status: 503 });
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  try {
    // ── 1. Log in ──────────────────────────────────────────────────────────────
    await page.goto("https://www.thegrint.com/users/sign_in", { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.fill('input[name="user[email]"], input[type="email"]', email);
    await page.fill('input[name="user[password]"], input[type="password"]', password);
    await page.click('input[type="submit"], button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 });

    const loginErr = await page.$('.alert-error, .flash-error, [data-alert]');
    if (loginErr) {
      const msg = await loginErr.textContent();
      await browser.close();
      return NextResponse.json({ ok: false, error: `Login failed: ${msg?.trim()}` }, { status: 401 });
    }

    // ── 2. Navigate to Add Score (Hole by Hole) ────────────────────────────────
    await page.goto("https://www.thegrint.com/golf-handicap/score-entry", { waitUntil: "domcontentloaded", timeout: 20000 });

    // Click "Hole by Hole" tab if not already active
    const hbhTab = await page.$('a:has-text("Hole by Hole"), [data-tab="hole_by_hole"]');
    if (hbhTab) await hbhTab.click();
    await page.waitForTimeout(500);

    // ── 3. Fill date ──────────────────────────────────────────────────────────
    const [yyyy, mm, dd] = date.split("-");
    await page.selectOption('select[name*="year"], #score_year', yyyy).catch(() => {});
    await page.selectOption('select[name*="month"], #score_month', String(parseInt(mm))).catch(() => {});
    await page.selectOption('select[name*="day"], #score_day', String(parseInt(dd))).catch(() => {});

    // ── 4. Fill course ─────────────────────────────────────────────────────────
    const courseInput = await page.$('input[placeholder*="golf course"], input[name*="course"]');
    if (courseInput) {
      await courseInput.fill(courseName);
      await page.waitForTimeout(1200);
      // Click first autocomplete suggestion
      const suggestion = await page.$('.autocomplete-suggestion, .ui-menu-item, [role="option"]');
      if (suggestion) await suggestion.click();
    }

    // ── 5. Select tee ─────────────────────────────────────────────────────────
    await page.waitForTimeout(500);
    const teeSelect = await page.$('select[name*="tee"], #score_tee_id');
    if (teeSelect) {
      const options = await teeSelect.evaluate(el =>
        Array.from((el as HTMLSelectElement).options).map(o => ({ v: o.value, t: o.text }))
      );
      const match = options.find((o: any) =>
        o.t.toLowerCase().includes(tee.toLowerCase()) ||
        tee.toLowerCase().includes(o.t.toLowerCase())
      );
      if (match) await page.selectOption('select[name*="tee"], #score_tee_id', match.v);
    }

    // ── 6. Fill hole-by-hole scores ────────────────────────────────────────────
    await page.waitForTimeout(800);
    for (const h of holes) {
      const holeNum = h.hole;
      // Common selector patterns TheGrint uses
      const scoreSelectors = [
        `input[name*="score"][name*="${holeNum}"]`,
        `#score_h${holeNum}`,
        `input[data-hole="${holeNum}"]`,
        `.hole-${holeNum} input[name*="score"]`,
      ];
      for (const sel of scoreSelectors) {
        const el = await page.$(sel);
        if (el) { await el.fill(String(h.score)); break; }
      }

      const puttSelectors = [
        `input[name*="putt"][name*="${holeNum}"]`,
        `#putt_h${holeNum}`,
        `.hole-${holeNum} input[name*="putt"]`,
      ];
      for (const sel of puttSelectors) {
        const el = await page.$(sel);
        if (el) { await el.fill(String(h.putts)); break; }
      }

      if (h.penalties) {
        const penSelectors = [
          `input[name*="penalt"][name*="${holeNum}"]`,
          `#penalty_h${holeNum}`,
          `.hole-${holeNum} input[name*="penalt"]`,
        ];
        for (const sel of penSelectors) {
          const el = await page.$(sel);
          if (el) { await el.fill(h.penalties); break; }
        }
      }
    }

    // ── 7. Practice round checkbox ─────────────────────────────────────────────
    if (practiceRound) {
      const practiceSelectors = [
        'input[name*="practice"]',
        'input#score_practice',
        'label:has-text("Practice") input',
        'input[id*="practice"]',
      ];
      for (const sel of practiceSelectors) {
        try {
          const el = await page.$(sel);
          if (el) {
            const checked = await el.isChecked();
            if (!checked) await el.check();
            break;
          }
        } catch {}
      }
      // Fallback: find label containing "Practice" and click adjacent checkbox
      try {
        await page.locator('label', { hasText: /Practice/i }).first().click();
      } catch {}
    }

    // ── 8. Submit ──────────────────────────────────────────────────────────────
    const submitBtn = await page.$('input[type="submit"][value*="Submit"], button:has-text("Submit")');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 });
    }

    const success = page.url().includes("score") || page.url().includes("handicap");
    await browser.close();

    return NextResponse.json({
      ok: true,
      message: success
        ? "Score submitted to TheGrint successfully."
        : "Form submitted — please verify on TheGrint.",
    });
  } catch (err: unknown) {
    await browser.close();
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
