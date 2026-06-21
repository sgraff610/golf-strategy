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

  // Block heavy resources — page loads 3-4x faster
  await page.setRequestInterception(true);
  page.on('request', req => {
    const t = req.resourceType();
    if (t === 'image' || t === 'stylesheet' || t === 'font' || t === 'media') req.abort();
    else req.continue();
  });

  if (cookies && cookies.length) await page.setCookie(...cookies);

  await page.goto("https://thegrint.com/score/add_full_score/", { waitUntil: "domcontentloaded", timeout: 15000 });

  if (page.url().includes("passthru")) {
    return Response.json({ ok: false, error: "Session expired — please try again." });
  }

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

  // Course autocomplete
  await page.waitForSelector("#ucourse", { timeout: 5000 }).catch(() => {});
  await page.click("#ucourse").catch(() => {});
  await page.type("#ucourse", courseName.slice(0, 12), { delay: 60 });
  await waitMs(3000);

  const suggestionSels = [".suggestion", ".ui-menu-item", ".ui-autocomplete li", "[class*='suggestion']", "[class*='autocomplete'] li"];
  for (const sel of suggestionSels) {
    const el = await page.$(sel).catch(() => null);
    if (el) { await el.click().catch(() => {}); break; }
  }

  // Tees
  await waitMs(3000);
  const teeOpts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('select[name="tees"] option'))
      .map(o => ({ v: o.value, t: (o.textContent || "").trim() }))
      .filter(o => o.v !== "")
  ).catch(() => []);

  if (teeOpts.length === 0) {
    return Response.json({ ok: false, error: "Course not found in TheGrint — the autocomplete did not match \\"" + courseName + "\\". Open TheGrint directly to confirm the exact course name." });
  }

  const teeMatch = teeOpts.find(o =>
    tee && (o.t.toLowerCase().includes(tee.toLowerCase()) || tee.toLowerCase().includes(o.t.toLowerCase()))
  ) || teeOpts[0];
  if (teeMatch && teeMatch.v) await page.select('select[name="tees"]', teeMatch.v).catch(() => {});

  // Round type
  const is9 = holes.length <= 9;
  const isBack = is9 && holes[0] && holes[0].hole > 9;
  if (is9) {
    await page.select('select[name="round"]', isBack ? "B9" : "F9").catch(() => {});
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

  // Verify scores filled
  const missing = await page.evaluate((holeNums) => {
    var bad = [];
    for (var i = 0; i < holeNums.length; i++) {
      var n = holeNums[i];
      var el = document.querySelector('input[name="scH' + n + '"]');
      var val = el ? el.value.trim() : "";
      if (!val || val === "0") bad.push(n);
    }
    return bad;
  }, holes.map(h => h.hole));

  if (missing.length > 0) {
    return Response.json({ ok: false, error: "Score fields not filled for hole(s): " + missing.join(", ") + ". The form may not have loaded correctly — please try again." });
  }
`;

// Submit path — clicks the submit button after filling scores.
const SUBMIT_CODE = `
export default async function({ page, context }) {
  try {
${SHARED_BODY}

    // Practice round
    if (practiceRound) {
      const checked = await page.$eval("#practice_score", el => el.checked).catch(() => false);
      if (!checked) await page.click("#practice_score").catch(() => {});
    }

    // Submit
    await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll("a,button")).find(e => (e.textContent || "").includes("Submit"));
      if (el) el.click();
    });
    await waitMs(600);
    await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll("a")).find(e => (e.textContent || "").includes("Not now"));
      if (el) el.click();
    });
    await waitMs(800);

    const finalUrl = page.url();
    const teeLabel = (teeMatch && teeMatch.t) || tee || "unknown tee";
    return Response.json({
      ok: true,
      message: !finalUrl.includes("add_full_score")
        ? "Score submitted and saved to TheGrint. Tee: " + teeLabel
        : "Score submitted — verify it appeared in your score history. Tee: " + teeLabel,
    });
  } catch (err) {
    return Response.json({ ok: false, error: "Submit error: " + String(err) });
  }
}
`;

// Preview path — fills scores identically but takes a screenshot instead of submitting.
const PREVIEW_CODE = `
export default async function({ page, context }) {
  try {
${SHARED_BODY}

    const shot = await page.screenshot({ encoding: "base64" });
    return Response.json({ ok: true, previewShot: "data:image/png;base64," + shot });
  } catch (err) {
    return Response.json({ ok: false, error: "Preview error: " + String(err) });
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
            // preview response uses previewShot key; submit uses message
            jsonOut = { ok: true, message: pd.message || "Submitted.", preview: !!pd.previewShot, screenshot: pd.previewShot };
          } else {
            const errMsg = pd?.error || pd?.message || JSON.stringify(result).slice(0, 200);
            jsonOut = { ok: false, error: errMsg || "Unknown error from Browserless" };
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
