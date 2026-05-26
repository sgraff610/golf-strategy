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

// This code runs inside Browserless's remote browser (Puppeteer API)
const AUTOMATION_CODE = `
export default async function({ page, context }) {
  const { email, password, date, courseName, tee, holes, practiceRound } = context;

  async function waitMs(ms) {
    await new Promise(r => setTimeout(r, ms));
  }

  async function fill(sel, val) {
    await page.$eval(sel, (el, v) => {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, val);
  }

  async function selectOpt(sel, val) {
    await page.select(sel, val).catch(() => {});
  }

  // 1. Navigate
  await page.goto("https://thegrint.com/score/add_full_score/", { waitUntil: "networkidle2", timeout: 30000 });

  // 2. Login if redirected
  if (page.url().includes("passthru")) {
    try {
      await page.waitForSelector("#usernameLogin", { visible: true, timeout: 8000 });
    } catch {
      await page.evaluate(() => {
        ["usernameLogin","pwdLogin","submit-form-login"].forEach(id => {
          let node = document.getElementById(id);
          while (node && node !== document.body) {
            node.style.cssText += ";display:block!important;visibility:visible!important;opacity:1!important;";
            node = node.parentElement;
          }
        });
      });
      await waitMs(500);
    }
    await fill("#usernameLogin", email);
    await fill("#pwdLogin", password);
    await page.click("#submit-form-login");
    await waitMs(3000);

    if (page.url().includes("passthru")) {
      return Response.json({ ok: false, error: "Login failed — check your TheGrint username and password." });
    }

    await page.goto("https://thegrint.com/", { waitUntil: "domcontentloaded", timeout: 20000 });
    await waitMs(3000);
    await page.goto("https://thegrint.com/score/add_full_score/", { waitUntil: "networkidle2", timeout: 20000 });
    await waitMs(1500);
  }

  // 3. Date
  const [yyyy, mm, dd] = date.split("-");
  await selectOpt('select[name="year"]', yyyy);
  await selectOpt('select[name="month"]', mm);
  await selectOpt('select[name="date"]', dd);

  // 4. Course
  await page.click("#ucourse");
  await waitMs(400);
  await page.keyboard.press("Control+a");
  await waitMs(50);
  await page.keyboard.type(courseName, { delay: 80 });
  await waitMs(300);
  try {
    await page.waitForSelector(".suggestion", { visible: true, timeout: 7000 });
    const first = await page.$(".suggestion");
    if (first) await first.click();
  } catch {}
  await waitMs(2500);

  // 5. Tee
  let teeOpts = [];
  for (let i = 0; i < 8; i++) {
    teeOpts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('select[name="tees"] option'))
        .map(o => ({ v: o.value, t: (o.textContent || "").trim() }))
        .filter(o => o.v !== "")
    );
    if (teeOpts.length) break;
    await waitMs(500);
  }
  const teeMatch = teeOpts.find(o =>
    o.t.toLowerCase().includes(tee.toLowerCase()) || tee.toLowerCase().includes(o.t.toLowerCase())
  ) || teeOpts[0];
  if (teeMatch?.v) await selectOpt('select[name="tees"]', teeMatch.v);

  // 6. Round type
  const is9 = holes.length <= 9;
  const isBack = is9 && holes[0]?.hole > 9;
  if (is9) {
    for (let i = 0; i < 3; i++) {
      await selectOpt('select[name="round"]', isBack ? "B9" : "F9");
      await waitMs(800);
      const cur = await page.$eval('select[name="round"]', el => el.value).catch(() => "");
      if (cur !== "18") break;
    }
    await waitMs(2000);
  }

  // 7. Scores
  for (const h of holes) {
    const n = h.hole;
    if (h.score) await fill('input[name="scH' + n + '"]', String(h.score)).catch(() => {});
    if (h.putts) await fill('input[name="ptH' + n + '"]', String(h.putts)).catch(() => {});
    if (h.penalties) await fill('input[name="pH' + n + '"]', h.penalties).catch(() => {});
  }

  // 8. Practice round
  if (practiceRound) {
    const checked = await page.$eval("#practice_score", el => el.checked).catch(() => false);
    if (!checked) await page.click("#practice_score").catch(() => {});
  }

  // 9. Submit
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("a,button")).find(e => (e.textContent || "").includes("Submit"));
    if (el) el.click();
  });
  await waitMs(2000);
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("a")).find(e => (e.textContent || "").includes("Not now"));
    if (el) el.click();
  });
  await waitMs(4000);

  const finalUrl = page.url();
  return Response.json({
    ok: true,
    message: !finalUrl.includes("add_full_score")
      ? "Score submitted and saved to TheGrint."
      : "Score submitted to TheGrint — verify it appeared in your score history.",
  });
}
`;

export async function POST(req: NextRequest) {
  let payload: SubmitPayload;
  try { payload = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const { email, password, date, courseName, tee, holes, practiceRound } = payload;
  if (!email || !password)
    return NextResponse.json({ ok: false, error: "Missing credentials" }, { status: 400 });

  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) {
    return NextResponse.json({
      ok: false,
      error: "Auto-submit is not configured. Set BROWSERLESS_TOKEN in your Vercel environment variables. Get a free token at browserless.io.",
    }, { status: 503 });
  }

  try {
    const res = await fetch(
      `https://production-sfo.browserless.io/function?token=${token}&timeout=55000`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: AUTOMATION_CODE,
          context: { email, password, date, courseName, tee, holes, practiceRound },
        }),
        signal: AbortSignal.timeout(58000),
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return NextResponse.json({ ok: false, error: `Browserless error ${res.status}: ${text}` }, { status: 500 });
    }

    const result = await res.json();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, error: `Automation failed: ${err}` }, { status: 500 });
  }
}
