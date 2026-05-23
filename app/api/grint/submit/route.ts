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

// Confirmed via DOM inspection of https://thegrint.com/passthru
const GRINT_USERNAME = "#usernameLogin";
const GRINT_PASSWORD = "#pwdLogin";
const GRINT_SUBMIT   = "#submit-form-login";

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
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });

  // Mask webdriver flag before any page load
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    // @ts-ignore
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
    // @ts-ignore
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    // @ts-ignore
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
  });

  const page = await ctx.newPage();

  try {
    // ── 1. Navigate to add-score (redirects to /passthru when logged out) ─────
    await page.goto("https://thegrint.com/score/add_full_score/", {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    const landedUrl = page.url();
    const needsLogin = landedUrl.includes("passthru") ||
      landedUrl.includes("sign_in") || landedUrl.includes("login");

    if (needsLogin) {
      // ── 2. Wait for the form to appear, force-show if still hidden after 8s ──
      let formVisible = false;
      try {
        await page.waitForSelector(GRINT_USERNAME, { state: "visible", timeout: 8000 });
        formVisible = true;
      } catch {
        // Form elements exist in DOM but CSS keeps them hidden.
        // Force-show every hidden element in the login container.
        await page.evaluate(() => {
          const ids = ["usernameLogin", "pwdLogin", "submit-form-login", "customCheck1"];
          ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            // Walk up to the nearest hidden ancestor and reveal it
            let node: HTMLElement | null = el;
            while (node && node !== document.body) {
              const style = window.getComputedStyle(node);
              if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
                node.style.cssText += ";display:block!important;visibility:visible!important;opacity:1!important;";
              }
              node = node.parentElement;
            }
          });
        });
        await page.waitForTimeout(500);
      }

      // ── 3. Fill credentials ────────────────────────────────────────────────────
      await page.fill(GRINT_USERNAME, email);
      await page.fill(GRINT_PASSWORD, password);
      await page.click(GRINT_SUBMIT);

      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(3000);

      const afterUrl = page.url();
      if (afterUrl.includes("passthru")) {
        const errEl = await page.$(".alert, .invalid-feedback, [class*='error']");
        const errMsg = errEl ? await errEl.textContent() : "";
        await browser.close();
        return NextResponse.json({
          ok: false,
          error: errMsg?.trim() || "Login failed — check your TheGrint username and password.",
        }, { status: 401 });
      }

      // ── 4. Navigate to add-score now logged in ────────────────────────────────
      await page.goto("https://thegrint.com/score/add_full_score/", {
        waitUntil: "networkidle",
        timeout: 20000,
      });
      await page.waitForTimeout(1500);
    }

    // ── 5. Confirm on score page ──────────────────────────────────────────────
    const scoreUrl = page.url();
    if (!scoreUrl.includes("score")) {
      await browser.close();
      return NextResponse.json({ ok: false, error: `Unexpected page: ${scoreUrl}` }, { status: 422 });
    }

    // ── 6. Click "Hole by Hole" tab ───────────────────────────────────────────
    for (const sel of ['a:has-text("Hole by Hole")', '[data-tab="hole_by_hole"]']) {
      const el = await page.$(sel);
      if (el) { await el.click(); await page.waitForTimeout(700); break; }
    }

    // ── 7. Fill date ──────────────────────────────────────────────────────────
    const [yyyy, mm, dd] = date.split("-");
    await page.selectOption('select[name*="year"], #score_year', yyyy).catch(() => {});
    await page.selectOption('select[name*="month"], #score_month', String(parseInt(mm))).catch(() => {});
    await page.selectOption('select[name*="day"], #score_day', String(parseInt(dd))).catch(() => {});

    // ── 8. Fill course ────────────────────────────────────────────────────────
    for (const sel of ['input[placeholder*="golf course" i]', 'input[placeholder*="course" i]', 'input[name*="course"]']) {
      const el = await page.$(sel);
      if (el) {
        await el.fill(courseName);
        await page.waitForTimeout(1800);
        for (const sug of ['.autocomplete-suggestion', '.ui-menu-item', '[role="option"]']) {
          const s = await page.$(sug);
          if (s) { await s.click(); break; }
        }
        break;
      }
    }

    // ── 9. Select tee ─────────────────────────────────────────────────────────
    await page.waitForTimeout(800);
    for (const sel of ['select[name*="tee"]', '#score_tee_id']) {
      const el = await page.$(sel);
      if (el) {
        const options = await el.evaluate(node =>
          Array.from((node as HTMLSelectElement).options).map(o => ({ v: o.value, t: o.text }))
        ) as { v: string; t: string }[];
        const match = options.find(o =>
          o.t.toLowerCase().includes(tee.toLowerCase()) || tee.toLowerCase().includes(o.t.toLowerCase())
        );
        if (match) await page.selectOption(sel, match.v);
        break;
      }
    }

    // ── 10. Fill hole scores ──────────────────────────────────────────────────
    await page.waitForTimeout(800);
    for (const h of holes) {
      const n = h.hole;
      await tryFill(page, [`input[name*="score"][name*="${n}"]`, `#score_h${n}`, `input[data-hole="${n}"]`], String(h.score));
      if (h.putts) await tryFill(page, [`input[name*="putt"][name*="${n}"]`, `#putt_h${n}`], String(h.putts));
      if (h.penalties) await tryFill(page, [`input[name*="penalt"][name*="${n}"]`, `#penalty_h${n}`], h.penalties);
    }

    // ── 11. Practice round ────────────────────────────────────────────────────
    if (practiceRound) {
      const pr = await page.$('input[name*="practice"], input#score_practice');
      if (pr && !await pr.isChecked()) await pr.check();
      else {
        try { await page.locator("label", { hasText: /Practice/i }).first().click(); } catch {}
      }
    }

    // ── 12. Submit ────────────────────────────────────────────────────────────
    const submitBtn = await page.$('input[type="submit"][value*="Submit" i], button:has-text("Submit")');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(2000);
    }

    await browser.close();
    return NextResponse.json({ ok: true, message: "Score submitted to TheGrint — check your account to confirm." });

  } catch (err: unknown) {
    const url = page.url();
    await browser.close();
    return NextResponse.json({ ok: false, error: `${err instanceof Error ? err.message : String(err)} (at ${url})` }, { status: 500 });
  }
}
