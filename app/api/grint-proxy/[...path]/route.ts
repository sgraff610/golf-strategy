import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const GRINT = "https://thegrint.com";
const PROXY = "/api/grint-proxy";

function rewriteUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith(PROXY)) return url;
  if (url.startsWith(GRINT)) return PROXY + url.slice(GRINT.length);
  if (url.startsWith("//thegrint.com")) return PROXY + url.slice("//thegrint.com".length);
  if (url.startsWith("/") && !url.startsWith("//")) return PROXY + url;
  return url;
}

// Injected into every proxied HTML page.
// 1. Intercepts fetch/XHR so AJAX calls go through our proxy (fixes CORS + prevents app handoff)
// 2. Intercepts link clicks and form submits (belt-and-suspenders)
// 3. Reads round fill data from hash or sessionStorage and auto-fills the score form
const INJECTED = `<script>
(function(){
  var G='https://thegrint.com', P='/api/grint-proxy';
  function rw(u){
    if(!u||typeof u!=='string')return u;
    if(u.startsWith(P))return u;
    if(u.startsWith(G))return P+u.slice(G.length);
    if(u.startsWith('//thegrint.com'))return P+u.slice('//thegrint.com'.length);
    return u;
  }

  /* --- Intercept fetch --- */
  var _fetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    var url=typeof input==='string'?input:(input&&input.url)||String(input);
    var rwUrl=rw(url);
    if(rwUrl!==url)return _fetch(rwUrl,init);
    return _fetch(input,init);
  };

  /* --- Intercept XMLHttpRequest --- */
  var _open=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(method,url){
    var args=Array.prototype.slice.call(arguments);
    if(typeof url==='string')args[1]=rw(url);
    return _open.apply(this,args);
  };

  /* --- Intercept link clicks --- */
  document.addEventListener('click',function(e){
    var a=e.target&&e.target.closest('a');
    if(!a)return;
    var h=a.getAttribute('href');
    if(!h)return;
    var r=rw(h);
    if(r!==h){e.preventDefault();location.href=r;}
  },true);

  /* --- Intercept form submits --- */
  document.addEventListener('submit',function(e){
    var f=e.target;
    var a=f.getAttribute('action')||location.href;
    var r=rw(a);
    if(r!==a){e.preventDefault();f.setAttribute('action',r);f.submit();}
  },true);

  /* --- Auto-fill score form --- */
  var data=null;
  var hash=window.location.hash||'';
  if(hash.startsWith('#gl=')){
    try{data=JSON.parse(decodeURIComponent(atob(hash.slice(4))));sessionStorage.setItem('gl_fill',JSON.stringify(data));}catch(e){}
  }else{
    try{var s=sessionStorage.getItem('gl_fill');if(s)data=JSON.parse(s);}catch(e){}
  }

  if(data){
    function setVal(s,v){
      var el=document.querySelector(s);
      if(!el)return false;
      el.value=String(v);
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      return true;
    }
    function wait(ms){return new Promise(function(r){setTimeout(r,ms);})}

    async function fill(){
      /* date */
      var pts=data.date.split('-');
      setVal('select[name="year"]',pts[0]);
      setVal('select[name="month"]',pts[1]);
      setVal('select[name="date"]',pts[2]);
      await wait(300);

      /* course */
      var ci=document.querySelector('#ucourse');
      if(ci&&data.courseName){
        ci.value=data.courseName;
        ci.dispatchEvent(new Event('input',{bubbles:true}));
        ci.dispatchEvent(new Event('change',{bubbles:true}));
        await wait(1500);
        var sg=document.querySelector('.suggestion');
        if(sg){sg.click();await wait(1500);}
      }

      /* tee */
      var teeOpts=Array.from(document.querySelectorAll('select[name="tees"] option')).filter(function(o){return o.value;});
      var tm=teeOpts.find(function(o){return (o.textContent||'').toLowerCase().includes((data.tee||'').toLowerCase());})||teeOpts[0];
      if(tm)setVal('select[name="tees"]',tm.value);
      await wait(400);

      /* round type for 9-hole rounds */
      if(data.holes&&data.holes.length<=9){
        var isBack=data.holes[0]&&data.holes[0].hole>9;
        setVal('select[name="round"]',isBack?'B9':'F9');
        await wait(800);
      }

      /* scores */
      var taMap={Hit:'H',Left:'L',Right:'R',Short:'S',Long:'P'};
      if(data.holes){
        for(var i=0;i<data.holes.length;i++){
          var h=data.holes[i];
          if(h.score)setVal('input[name="scH'+h.hole+'"]',h.score);
          if(h.putts)setVal('input[name="ptH'+h.hole+'"]',h.putts);
          if(h.penalties)setVal('input[name="pH'+h.hole+'"]',h.penalties);
          var ta=taMap[h.tee_accuracy];
          if(ta){
            var fhEl=document.querySelector('input[name="fH'+h.hole+'"]');
            var txEl=fhEl&&fhEl.previousElementSibling;
            if(txEl){['keydown','keypress','keyup'].forEach(function(n){txEl.dispatchEvent(new KeyboardEvent(n,{key:ta,charCode:ta.charCodeAt(0),keyCode:ta.charCodeAt(0),which:ta.charCodeAt(0),bubbles:true,cancelable:true}));});await wait(300);}
          }
        }
      }

      /* practice round */
      if(data.practiceRound){
        var pr=document.querySelector('#practice_score');
        if(pr&&!pr.checked)pr.click();
      }
    }

    if(document.readyState==='loading'){
      document.addEventListener('DOMContentLoaded',function(){fill().catch(function(){});});
    }else{
      fill().catch(function(){});
    }
  }
})();
</script>`;

function rewriteHtml(html: string): string {
  // Rewrite href/src/action pointing to TheGrint or root-relative paths
  html = html.replace(
    /\b(href|src|action)="(https?:\/\/thegrint\.com[^"]*|\/\/thegrint\.com[^"]*|\/(?!api\/grint-proxy)[^"]*)"/gi,
    (_: string, attr: string, url: string) => `${attr}="${rewriteUrl(url)}"`
  );
  html = html.replace(
    /\b(href|src|action)='(https?:\/\/thegrint\.com[^']*|\/\/thegrint\.com[^']*|\/(?!api\/grint-proxy)[^']*)'/gi,
    (_: string, attr: string, url: string) => `${attr}='${rewriteUrl(url)}'`
  );
  // Inject before </head>; fall back to prepending
  return html.includes("</head>")
    ? html.replace("</head>", INJECTED + "</head>")
    : INJECTED + html;
}

function stripSetCookieDomain(sc: string): string {
  // Remove domain= so cookie is stored under our domain, not thegrint.com
  return sc.replace(/;\s*domain=[^;,]*/gi, "");
}

async function handle(req: NextRequest, segments: string[]): Promise<NextResponse> {
  const path = "/" + segments.join("/");
  const search = req.nextUrl.search;
  const target = GRINT + path + search;

  const fwd: Record<string, string> = {
    "user-agent": req.headers.get("user-agent") ?? "Mozilla/5.0",
    "accept": req.headers.get("accept") ?? "text/html,application/xhtml+xml,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "referer": GRINT + "/",
    "origin": GRINT,
  };
  const cookie = req.headers.get("cookie");
  if (cookie) fwd["cookie"] = cookie;
  const ct = req.headers.get("content-type");
  if (ct) fwd["content-type"] = ct;

  let body: ArrayBuffer | undefined;
  if (!["GET", "HEAD"].includes(req.method)) body = await req.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(target, { method: req.method, headers: fwd, body, redirect: "manual" });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }

  const out = new Headers();

  // Forward Set-Cookie with domain stripped
  const rawCookies: string[] =
    typeof (upstream.headers as any).getSetCookie === "function"
      ? (upstream.headers as any).getSetCookie()
      : upstream.headers.get("set-cookie")
      ? [upstream.headers.get("set-cookie")!]
      : [];
  for (const c of rawCookies) out.append("set-cookie", stripSetCookieDomain(c));

  // Redirect — rewrite Location to stay on our domain
  if (upstream.status >= 300 && upstream.status < 400) {
    const loc = upstream.headers.get("location") ?? "/";
    out.set("location", rewriteUrl(loc));
    return new NextResponse(null, { status: upstream.status, headers: out });
  }

  const upCT = upstream.headers.get("content-type") ?? "";
  out.set("content-type", upCT);
  // Deliberately omit X-Frame-Options and Content-Security-Policy so the iframe works

  if (upCT.includes("text/html")) {
    const html = await upstream.text();
    return new NextResponse(rewriteHtml(html), { status: upstream.status, headers: out });
  }

  return new NextResponse(await upstream.arrayBuffer(), { status: upstream.status, headers: out });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return handle(req, (await params).path);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return handle(req, (await params).path);
}
