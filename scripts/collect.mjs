// 보건의료 제도 모니터 - 뉴스 수집 스크립트 (GitHub Actions에서 실행)
// - 검색어 목록은 index.html 의 `const CATS = [...]` 를 그대로 읽어 씁니다 (한 곳만 고치면 됨).
// - Google 뉴스 RSS를 검색해 data/feed.json 에 합쳐 저장합니다 (최신 400건 유지).
// - 복지부·심평원·건보공단 공지사항 목록도 함께 읽어 '실무 정보'(q: "notice")로 저장합니다.
// - ANTHROPIC_API_KEY 가 설정돼 있으면 Claude로 상단 요약(data/brief.json)을 새로 만듭니다.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FEED = path.join(ROOT, "data", "feed.json");
const BRIEF = path.join(ROOT, "data", "brief.json");
const KEEP = 400;
const LEGACY = { fee2: "fee", hira2: "hira" };

// ---------- 검색어: index.html 에서 읽기 ----------
async function loadCats() {
  const html = await fs.readFile(path.join(ROOT, "index.html"), "utf8");
  const m = /const CATS = (\[[\s\S]*?\n\]);/.exec(html);
  if (!m) throw new Error("index.html 에서 CATS 목록을 찾지 못했습니다");
  return Function(`"use strict"; return (${m[1]});`)();
}

// ---------- RSS ----------
function decodeEnt(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39|#x27);/g, (m, e) => ({ nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", "#x27": "'" }[e]))
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n))
    .trim();
}
const pad = (n) => String(n).padStart(2, "0");
function kstDate(d) {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`;
}
function parseRss(xml) {
  const out = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  const pick = (blk, tag) => {
    const r = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(blk);
    return r ? decodeEnt(r[1]) : "";
  };
  let m;
  while ((m = re.exec(xml)) && out.length < 15) {
    const blk = m[1];
    const t = pick(blk, "title"), l = pick(blk, "link");
    if (!t || !/^https?:\/\//.test(l)) continue;
    const su = (/<source[^>]*url="([^"]*)"/.exec(blk) || [])[1] || "";
    const pd = new Date(pick(blk, "pubDate"));
    out.push({ t, l, s: pick(blk, "source"), su, d: isNaN(pd) ? "" : kstDate(pd) });
  }
  return out;
}
async function search(q) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:30d")}&hl=ko&gl=KR&ceid=KR:ko`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (health-policy-monitor)" }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseRss(await res.text());
}

// ---------- 기관 공지사항 (실무 정보) ----------
// 각 기관 게시판 목록 HTML에서 제목·날짜·링크를 읽습니다. 사이트 구조가 바뀌면 이 부분만 고치면 됩니다.
const NOISE = /채용|기간제|파견근무|합격자|면접|인턴|공무직|직원 모집|근로자|개인정보 목적 외 이용|당첨자|이벤트|경품|공모전|당선작|대학수학능력|수능/;
const stripTags = (s) => decodeEnt(String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
const NOTICE_SOURCES = [
  {
    org: "보건복지부", su: "https://www.mohw.go.kr", url: "https://www.mohw.go.kr/board.es?mid=a10501010000&bid=0003",
    parse(html) {
      const out = [];
      for (const tr of html.split(/<tr[\s>]/).slice(1)) {
        const a = /<a href="([^"]*act=view[^"]*)"[^>]*class="txt_title"[^>]*>([\s\S]*?)<\/a>/.exec(tr);
        const d = /data-label="등록일">\s*(\d{4}-\d{2}-\d{2})/.exec(tr);
        const cat = /data-label="분류">([^<]*)</.exec(tr);
        if (!a || !d) continue;
        if (cat && /채용/.test(cat[1])) continue;
        const t = stripTags(a[2].replace(/<span class="sr_only">[^<]*<\/span>/g, ""));
        out.push({ t, d: d[1], l: "https://www.mohw.go.kr" + decodeEnt(a[1]) });
      }
      return out;
    },
  },
  {
    org: "건강보험심사평가원", su: "https://www.hira.or.kr", url: "https://www.hira.or.kr/bbsDummy.do?pgmid=HIRAA020002000100",
    parse(html) {
      const out = [];
      for (const tr of html.split(/<tr[\s>]/).slice(1)) {
        const a = /class="col-tit"[^>]*>\s*<a href="([^"]*brdBltNo=\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(tr);
        const d = /class="col-date">\s*(\d{4}-\d{2}-\d{2})/.exec(tr);
        if (!a || !d) continue;
        out.push({ t: stripTags(a[2]), d: d[1], l: "https://www.hira.or.kr/bbsDummy.do" + decodeEnt(a[1]) });
      }
      return out;
    },
  },
  {
    org: "국민건강보험공단", su: "https://www.nhis.or.kr", url: "https://www.nhis.or.kr/nhis/together/wbhaea01000m01.do",
    parse(html) {
      const out = [];
      for (const tr of html.split(/<tr[\s>]/).slice(1)) {
        const a = /<a href="(\?mode=view[^"]*articleNo=\d+[^"]*)"[^>]*title="([^"]*)"/.exec(tr);
        const d = /(\d{4})\.(\d{2})\.(\d{2})/.exec(tr.replace(/<a[\s\S]*?<\/a>/g, ""));
        if (!a || !d) continue;
        out.push({ t: decodeEnt(a[2]).replace(/\s*자세히 보기\s*$/, "").trim(), d: `${d[1]}-${d[2]}-${d[3]}`, l: "https://www.nhis.or.kr/nhis/together/wbhaea01000m01.do" + decodeEnt(a[1]).replace(/&article\.offset=\d+&articleLimit=\d+/, "") });
      }
      return out;
    },
  },
];
async function fetchNotices(src) {
  const res = await fetch(src.url, { headers: { "User-Agent": "Mozilla/5.0 (health-policy-monitor)" }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = src.parse(await res.text()).filter((r) => r.t && !NOISE.test(r.t)).slice(0, 15);
  if (!rows.length) throw new Error("목록을 읽지 못함(사이트 구조 변경 가능)");
  return rows.map((r) => ({ ...r, q: "notice", s: src.org, su: src.su }));
}

// ---------- 병합 (페이지의 normalize 와 같은 기준) ----------
function cleanTitle(t, s) {
  t = t || "";
  const suf = " - " + (s || "");
  return s && t.endsWith(suf) ? t.slice(0, -suf.length) : t;
}
function merge(rows) {
  const seen = new Map();
  for (const r of rows) {
    const title = cleanTitle(r.t, r.s);
    const key = title.replace(/\s+/g, "");
    if (!title || seen.has(key)) continue;
    seen.set(key, { q: LEGACY[r.q] || r.q, t: r.t, s: r.s || "", su: r.su || "", d: r.d || "", l: r.l || "" });
  }
  return [...seen.values()].sort((a, b) => b.d.localeCompare(a.d)).slice(0, KEEP);
}
const idOf = (r) => cleanTitle(r.t, r.s).replace(/\s+/g, "").slice(0, 60);

// ---------- 요약 (선택) ----------
async function summarize(items, catKeys) {
  if (!process.env.ANTHROPIC_API_KEY) { console.log("ANTHROPIC_API_KEY 없음: 요약은 건너뜁니다."); return null; }
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const top = items.slice(0, 90).map((r) => ({ id: idOf(r), d: r.d, cat: r.q, src: r.s, title: cleanTitle(r.t, r.s) }));
  const prompt = `당신은 한국 보건의료 정책 모니터링 담당자입니다. 아래는 오늘 수집한 뉴스 제목 목록(JSON)입니다.
병원 경영·보험청구 실무자가 알아야 할 핵심 사안 6~8개를 골라 한국어로 요약하세요.
규칙:
- 제목 목록에 근거가 있는 내용만 쓰고, 추측하지 마세요. 수치는 제목에 있는 그대로만 쓰세요.
- 기사 간 수치가 다르면 status를 "conflict"로 하고 body에 어느 부분이 다른지 적으세요.
- status: 정부 기관(보건복지부, 정책브리핑, 건보공단, 심평원) 보도가 근거에 있으면 "gov", 서로 다른 출처 2곳 이상이면 "cross", 하나뿐이면 "single".
- 2027년 수가·보험료·청구 변경, 건강보험정책심의위원회 의결, 제도 개편, 비대면진료, 만성질환관리료, 검체검사 위·수탁 고시, 복지부 제도 변경, 협회(병협·의협·간협·약사회·의료기사)의 의견·성명을 우선하세요.
- refs에는 근거 기사 id를 1~4개 넣으세요.
출력은 JSON 객체 하나만, 다른 글 없이: {"points":[{"title":"한 줄 제목","body":"2~3문장","status":"gov|cross|single|conflict","cats":["${catKeys.join("|")}"],"refs":["id"]}]}

[기사 목록]
${JSON.stringify(top)}`;

  // Claude Opus 5.5 + 서버 측 거절 대비(fallbacks: "default"): 안전 분류로 거절되면 API가 다른 모델로 이어서 답합니다.
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    messages: [{ role: "user", content: prompt }],
  });
  if (response.stop_reason === "refusal") { console.log("요약 요청이 거절됐습니다:", response.stop_details?.category); return null; }
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b < a) { console.log("요약 응답에서 JSON을 찾지 못했습니다."); return null; }
  const out = JSON.parse(text.slice(a, b + 1));
  if (!Array.isArray(out.points)) return null;
  return {
    by: "refresh",
    updatedAt: new Date().toISOString(),
    points: out.points.slice(0, 8).map((p) => ({
      title: String(p.title || ""), body: String(p.body || ""),
      status: ["gov", "cross", "single", "conflict"].includes(p.status) ? p.status : "single",
      cats: (p.cats || []).map(String).slice(0, 3), refs: (p.refs || []).map(String).slice(0, 4),
    })),
  };
}

// ---------- 실행 ----------
const cats = await loadCats();
const jobs = cats.flatMap((c) => (c.q || []).map((q) => ({ k: c.k, q })));
let prev = [];
try { prev = JSON.parse(await fs.readFile(FEED, "utf8")).items || []; } catch { console.log("기존 feed.json 없음: 새로 만듭니다."); }

const raw = [], errors = [];
for (const j of jobs) {
  try {
    const rows = await search(j.q);
    rows.forEach((r) => raw.push({ ...r, q: j.k }));
    console.log(`OK  ${String(rows.length).padStart(2)}건  ${j.q}`);
  } catch (e) {
    errors.push(`${j.q} → ${e.message}`);
    console.log(`ERR ${j.q}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 800)); // 검색 간격
}
for (const src of NOTICE_SOURCES) {
  try {
    const rows = await fetchNotices(src);
    rows.forEach((r) => raw.push(r));
    console.log(`OK  ${String(rows.length).padStart(2)}건  [공지] ${src.org}`);
  } catch (e) {
    errors.push(`[공지] ${src.org} → ${e.message}`);
    console.log(`ERR [공지] ${src.org}: ${e.message}`);
  }
}
if (!raw.length) {
  console.error("모든 검색이 실패했습니다. 기존 데이터는 그대로 둡니다.");
  process.exit(1);
}
const items = merge(raw.concat(prev));
const source = process.env.GITHUB_EVENT_NAME === "workflow_dispatch" ? "manual" : "auto";
await fs.mkdir(path.dirname(FEED), { recursive: true });
await fs.writeFile(FEED, JSON.stringify({ items, updatedAt: new Date().toISOString(), source, queries: jobs.length, failed: errors.length, errors: errors.slice(0, 5) }, null, 1));
console.log(`저장: 새 기사 ${raw.length}건 → 보관 ${items.length}건 (검색 실패 ${errors.length}개)`);

try {
  const brief = await summarize(items, cats.map((c) => c.k));
  if (brief) { await fs.writeFile(BRIEF, JSON.stringify(brief, null, 1)); console.log(`요약 ${brief.points.length}개 저장`); }
} catch (e) {
  console.log("요약 실패(기사 수집은 저장됨):", e.message);
}
