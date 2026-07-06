import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

type HoleEntry = {
  hole: number; par: number; yards: number; stroke_index: number;
  score: number; ags: number; putts: number; penalties: string; tee_accuracy: string;
};
type SubmitPayload = {
  email: string; password: string; date: string;
  courseName: string; tee: string; holes: HoleEntry[]; practiceRound: boolean;
  preview?: boolean;
};

// ─── Shared setup steps (inlined into both code strings below) ───────────────
// Both SUBMIT_CODE and PREVIEW_CODE share the same login/navigate/course/tee/score
// logic. They differ only in the final action: submit vs screenshot.
// We use two separate code strings so NO boolean flag is needed in the context —
// Browserless reserves boolean context keys (preview, dryRun, etc.) and returns
// 400 "Unexpected string" when they are true.

const SHARED_BODY = `
  const { cookies, date, courseName, tee, holes, practiceRound } = context;

  async function waitMs(ms) { await new Promise(r => setTimeout(r, ms)); }

  if (cookies && cookies.length) await page.setCookie(...cookies);

  await page.goto("https://thegrint.com/score/add_full_score/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitMs(800);

  if (page.url().includes("passthru")) {
    return { ok: false, error: "Session expired — please try again." };
  }

  // Dismiss cookie consent banner before interacting with anything
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button,a'));
    const accept = btns.find(b => /^accept/i.test((b.textContent || '').trim()));
    if (accept) accept.click();
  }).catch(() => {});
  await waitMs(600);

  // Date
  const [yyyy, mm, dd] = date.split("-");
  await page.evaluate((y, m, d) => {
    function setSelect(name, val) {
      const el = document.querySelector('select[name="' + name + '"]');
      if (!el) return;
      el.value = val;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setSelect("year", y); setSelect("month", m); setSelect("date", d);
  }, yyyy, mm, dd);

  // Course autocomplete — type first ~10 chars via keyboard to trigger the search,
  // then wait for the AJAX round-trip before polling for the dropdown.
  await page.waitForSelector("#ucourse", { timeout: 4000 }).catch(() => {});
  // Use programmatic focus (not coordinate click) so overlays can't intercept
  await page.evaluate(() => {
    const el = document.querySelector("#ucourse");
    if (el) { el.value = ""; el.focus(); el.dispatchEvent(new Event("input", { bubbles: true })); }
  }).catch(() => {});
  await waitMs(300);
  // Type first 10 chars to trigger autocomplete without over-filtering results
  await page.keyboard.type(courseName.slice(0, 10), { delay: 80 }).catch(() => {});
  // Give TheGrint's server time to respond (debounce + round-trip)
  await waitMs(2500);

  // Poll for suggestion dropdown (up to 6s, check every 300ms)
  const suggestionSels = [".suggestion", ".ui-menu-item", ".ui-autocomplete li", "[class*='suggestion']", "[class*='autocomplete'] li", "li[class*='item']"];
  let suggEl = null;
  for (let si = 0; si < 20; si++) {
    await waitMs(300);
    for (const sel of suggestionSels) {
      suggEl = await page.$(sel).catch(() => null);
      if (suggEl) break;
    }
    if (suggEl) break;
  }
  if (!suggEl) {
    return { ok: false, error: "Course not found — autocomplete returned no results for: " + courseName + ". Verify the name on TheGrint directly." };
  }
  // Click suggestion via mouse events for reliability
  await page.evaluate((el) => {
    el.scrollIntoView();
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent("mouseup",   { bubbles: true, cancelable: true }));
    el.click();
  }, suggEl).catch(() => {});

  // Poll for tees to populate (up to 6s, check every 200ms)
  let teeFieldName = "";
  let teeOpts = [];
  for (let ti = 0; ti < 30; ti++) {
    await waitMs(200);
    const tr = await page.evaluate(() => {
      const el = document.querySelector('select[name="tees"]') || document.querySelector('select[name="tee"]');
      if (!el) return null;
      const opts = Array.from(el.options).map(o => ({ v: o.value, t: (o.textContent || "").trim() })).filter(o => o.v !== "");
      return opts.length > 0 ? { name: el.name, opts } : null;
    }).catch(() => null);
    if (tr) { teeFieldName = tr.name; teeOpts = tr.opts; break; }
  }

  if (teeOpts.length === 0) {
    return { ok: false, error: "Course not found — autocomplete did not match " + courseName + ". Open TheGrint directly and confirm the exact course name." };
  }

  const teeMatch = teeOpts.find(o =>
    tee && (o.t.toLowerCase().includes(tee.toLowerCase()) || tee.toLowerCase().includes(o.t.toLowerCase()))
  ) || teeOpts[0];
  if (teeMatch && teeMatch.v) {
    await page.evaluate((fn, val) => {
      const el = document.querySelector('select[name="' + fn + '"]');
      if (el) { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }
    }, teeFieldName, teeMatch.v).catch(() => {});
  }

  // Round type
  const is9 = holes.length <= 9;
  const isBack = is9 && holes[0] && holes[0].hole > 9;
  if (is9) {
    await page.evaluate((val) => {
      const el = document.querySelector('select[name="round"]');
      if (el) { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }
    }, isBack ? "B9" : "F9").catch(() => {});
    await waitMs(400);
  }

  // Fill scores + tee accuracy
  const teeAccMap = { "Hit":"H", "Left":"L", "Right":"R", "Short":"S", "Long":"P" };
  const hs = holes.map(h => ({ ...h, ta: teeAccMap[h.tee_accuracy] || "" }));
  await page.evaluate((holes) => {
    function setVal(sel, val) {
      const el = document.querySelector(sel);
      if (!el) return;
      el.value = val;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    for (const h of holes) {
      const n = h.hole;
      if (h.score) setVal('input[name="scH' + n + '"]', String(h.score));
      if (h.putts)  setVal('input[name="ptH' + n + '"]', String(h.putts));
      if (h.penalties) setVal('input[name="pH' + n + '"]', h.penalties);
      if (h.ta) {
        const fh = document.querySelector('input[name="fH' + n + '"]');
        const tx = fh && fh.previousElementSibling;
        if (tx) {
          const code = h.ta.charCodeAt(0);
          ["keydown", "keypress", "keyup"].forEach(type => {
            tx.dispatchEvent(new KeyboardEvent(type, { key: h.ta, charCode: code, keyCode: code, which: code, bubbles: true, cancelable: true }));
          });
        }
      }
    }
  }, hs);

`;

const SUBMIT_CODE = `
export default async function({ page, context }) {
  try {
${SHARED_BODY}

    if (practiceRound) {
      await page.evaluate(() => {
        const el = document.querySelector('#practice_score');
        if (el && !el.checked) el.click();
      }).catch(() => {});
    }

    // Auto-accept any native confirm/alert dialogs
    page.on('dialog', d => d.accept().catch(() => {}));

    // Listen for navigation BEFORE clicking Submit
    const navDone = page.waitForNavigation({ timeout: 15000, waitUntil: 'domcontentloaded' }).catch(() => null);

    // Click submit button — try common label variants, fall back to form.requestSubmit()
    await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('a,button,input[type="submit"],input[type="button"]'));
      const LABELS = ['submit', 'post score', 'add score', 'save score', 'save'];
      const el = candidates.find(e => {
        const t = (e.textContent || e.value || '').toLowerCase().trim();
        return LABELS.some(l => t.includes(l));
      });
      if (el) { el.click(); return; }
      const form = document.querySelector('form');
      if (form) { try { form.requestSubmit(); } catch { form.submit(); } }
    }).catch(() => {});

    await Promise.race([navDone, waitMs(10000)]);

    // Dismiss pro-membership upsell if it appears
    await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('a')).find(e => (e.textContent || '').includes('Not now'));
      if (el) el.click();
    }).catch(() => {});
    await waitMs(500);

    const teeLabel = (teeMatch && teeMatch.t) || tee || 'unknown tee';

    // Handle any confirmation / review page — TheGrint may require a second "Post" click
    const urlAfterFirstNav = page.url();
    if (!urlAfterFirstNav.includes('add_full_score')) {
      const CONFIRM_LABELS = ['confirm', 'post round', 'post score', 'post', 'done', 'finish'];
      const hasConfirmBtn = await page.evaluate((labels) => {
        const btns = Array.from(document.querySelectorAll('button,input[type="submit"],input[type="button"]'));
        return btns.some(b => {
          const t = (b.textContent || b.value || '').toLowerCase().trim();
          if (t.includes('cancel') || t.includes('back') || t.includes('edit')) return false;
          return labels.some(l => t.includes(l));
        });
      }, CONFIRM_LABELS).catch(() => false);

      if (hasConfirmBtn) {
        const confirmNav = page.waitForNavigation({ timeout: 10000, waitUntil: 'domcontentloaded' }).catch(() => null);
        await page.evaluate((labels) => {
          const btns = Array.from(document.querySelectorAll('button,input[type="submit"],input[type="button"]'));
          const btn = btns.find(b => {
            const t = (b.textContent || b.value || '').toLowerCase().trim();
            if (t.includes('cancel') || t.includes('back') || t.includes('edit')) return false;
            return labels.some(l => t.includes(l));
          });
          if (btn) btn.click();
        }, CONFIRM_LABELS).catch(() => {});
        await Promise.race([confirmNav, waitMs(8000)]);
        await waitMs(500);
      }
    }

    const finalUrl = page.url();

    // Always take a screenshot so the caller can see exactly where we landed
    const shotB64 = await page.screenshot({ encoding: "base64" }).catch(() => null);
    const screenshot = shotB64 ? "data:image/png;base64," + shotB64 : null;

    // Session expired → redirected to login
    if (finalUrl.includes('passthru') || (finalUrl.includes('/login') && !finalUrl.includes('add_full_score'))) {
      return { ok: false, error: 'Session expired — TheGrint redirected to login. Try again.', screenshot };
    }

    if (!finalUrl.includes('add_full_score')) {
      return { ok: true, message: 'Score submitted to TheGrint. Tee: ' + teeLabel + ' · landed on: ' + finalUrl, screenshot };
    }

    // Still on the entry page — submission didn't go through. Check for a page-level error.
    const pageError = await page.evaluate(() => {
      const errEl = document.querySelector('.alert-danger,.alert-error,[class*="error"],[class*="Error"],.notification-error,.flash-error');
      return errEl ? (errEl.textContent || '').trim().slice(0, 300) : null;
    }).catch(() => null);

    return {
      ok: false,
      error: pageError
        ? 'TheGrint validation error: ' + pageError
        : 'Submission did not complete — TheGrint stayed on the entry page. Try "Preview form" to see what was filled, or use the manual fill script.',
      screenshot,
    };
  } catch (err) {
    return { ok: false, error: 'Submit error: ' + String(err) };
  }
}
`;

// Preview path — fills scores identically but takes a screenshot instead of submitting.
const PREVIEW_CODE = `
export default async function({ page, context }) {
  try {
${SHARED_BODY}

    const shot = await page.screenshot({ encoding: "base64" });
    return { ok: true, previewShot: "data:image/png;base64," + shot };
  } catch (err) {
    return { ok: false, error: "Preview error: " + String(err) };
  }
}
`;

function parseCookies(headers: Headers): { name: string; value: string; domain: string; path: string }[] {
  const raw: string[] = (headers as any).getSetCookie?.() ?? [];
  if (!raw.length) {
    const single = headers.get("set-cookie");
    if (single) raw.push(single);
  }
  return raw.map(line => {
    const parts = line.split(";").map(s => s.trim());
    const [nameVal] = parts;
    const [name, ...rest] = nameVal.split("=");
    const value = rest.join("=");
    const pathPart = parts.find(p => p.toLowerCase().startsWith("path="));
    const domainPart = parts.find(p => p.toLowerCase().startsWith("domain="));
    return {
      name: name.trim(),
      value,
      domain: domainPart ? domainPart.split("=")[1].trim() : "thegrint.com",
      path: pathPart ? pathPart.split("=")[1].trim() : "/",
    };
  }).filter(c => c.name);
}

export async function POST(req: NextRequest) {
  let payload: SubmitPayload;
  try { payload = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const { email, password, date, courseName, tee, holes, practiceRound, preview = false } = payload;
  if (!email || !password)
    return NextResponse.json({ ok: false, error: "Missing credentials" }, { status: 400 });

  const token = process.env.BROWSERLESS_TOKEN;
  if (!token)
    return NextResponse.json({ ok: false, error: "Auto-submit is not configured. Set BROWSERLESS_TOKEN in your Vercel environment variables." }, { status: 503 });

  // Step 1: Login via direct HTTP
  let cookies: ReturnType<typeof parseCookies> = [];
  try {
    const loginRes = await fetch("https://thegrint.com/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Referer": "https://thegrint.com/",
        "Origin": "https://thegrint.com",
      },
      body: new URLSearchParams({ username: email, password, redirect: "" }).toString(),
      redirect: "manual",
    });

    const location = loginRes.headers.get("location") ?? "";
    if (loginRes.status !== 302 || location.includes("passthru") || location.includes("login")) {
      return NextResponse.json({ ok: false, error: "Login failed — check your TheGrint username and password." });
    }

    cookies = parseCookies(loginRes.headers);
    if (!cookies.length) {
      return NextResponse.json({ ok: false, error: "Login succeeded but no session cookies returned." });
    }
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: `Login request failed: ${err?.message || err}` }, { status: 500 });
  }

  // Step 2: Stream response with heartbeats so iOS doesn't kill the connection.
  const enc = new TextEncoder();
  // No boolean flags in context — Browserless reserves them and returns 400 when true.
  const context = { cookies, date, courseName, tee, holes, practiceRound };
  const automationCode = preview ? PREVIEW_CODE : SUBMIT_CODE;

  const stream = new ReadableStream({
    async start(controller) {
      const hb = setInterval(() => {
        try { controller.enqueue(enc.encode(" ")); } catch {}
      }, 4000);

      let jsonOut: object;
      try {
        const bRes = await fetch(
          `https://production-sfo.browserless.io/function?token=${token}&timeout=60000`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: automationCode, context }),
            signal: AbortSignal.timeout(65000),
          }
        );

        if (!bRes.ok) {
          const txt = await bRes.text().catch(() => bRes.statusText);
          const isNavErr = txt.toLowerCase().includes("navigation") || txt.toLowerCase().includes("newrit");
          jsonOut = { ok: false, error: isNavErr
            ? "TheGrint rejected the submission — the course likely wasn't found via autocomplete. Open TheGrint and confirm the exact course name, then try again."
            : `Browserless error ${bRes.status}: ${txt.slice(0, 200)}` };
        } else {
          const raw = await bRes.text();
          let result: any;
          try { result = JSON.parse(raw); } catch {
            jsonOut = { ok: false, error: `Browserless non-JSON: ${raw.slice(0, 200)}` };
            clearInterval(hb);
            controller.enqueue(enc.encode(JSON.stringify(jsonOut)));
            controller.close();
            return;
          }
          const pd = (result?.data && typeof result.data === "object") ? result.data : result;
          if (pd?.ok === true) {
            // preview response uses previewShot key; submit uses message + screenshot
            jsonOut = { ok: true, message: pd.message || "Submitted.", preview: !!pd.previewShot, screenshot: pd.previewShot || pd.screenshot || null };
          } else {
            const errMsg = pd?.error || pd?.message || JSON.stringify(result).slice(0, 200);
            jsonOut = { ok: false, error: errMsg || "Unknown error from Browserless", screenshot: pd?.screenshot || null };
          }
        }
      } catch (err: any) {
        jsonOut = { ok: false, error: `Automation failed: ${err?.message || err}` };
      }

      clearInterval(hb);
      controller.enqueue(enc.encode(JSON.stringify(jsonOut)));
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
