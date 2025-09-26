// server.js
const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const dayjs = require("dayjs");

const app = express();
const server = http.createServer(app);
const io = require("socket.io")(server, { cors: { origin: "*" } });

const DATA_DIR = path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");
const CONFIG_JSON = path.join(DATA_DIR, "config.json");
const VOTES_LOG = path.join(DATA_DIR, "votes.jsonl");
const STATS_JSON = path.join(DATA_DIR, "stats.json");
const HISTORY_JSON = path.join(DATA_DIR, "history.json"); // 每個選項對應名字陣列

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
if (!fs.existsSync(VOTES_LOG)) fs.writeFileSync(VOTES_LOG, "");
if (!fs.existsSync(STATS_JSON)) fs.writeFileSync(STATS_JSON, JSON.stringify({}));

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// 讀設定
let config = { title: "投票活動", options: [] };
try { config = JSON.parse(fs.readFileSync(CONFIG_JSON, "utf8")); } catch {}

// 讀統計
let stats = {};
try { stats = JSON.parse(fs.readFileSync(STATS_JSON, "utf8")); } catch {}

let history = {};
try { history = JSON.parse(fs.readFileSync(HISTORY_JSON, "utf8")); } catch { history = {}; }

let nameSets = {};
function rebuildNameSets() {
  nameSets = {};
  Object.keys(history).forEach(optId => {
    nameSets[optId] = new Set(history[optId]);
  });
}
rebuildNameSets();

function persistStats() {
  fs.writeFileSync(STATS_JSON, JSON.stringify(stats, null, 2));
}

function persistHistory() {
  fs.writeFileSync(HISTORY_JSON, JSON.stringify(history, null, 2));
}

// API：取得設定與即時統計
app.get("/api/config", (req, res) => {
  res.json({ ok: true, config, stats });
});

// API：投票（任何人可投；若要防洗票可加裝置/時間限制）
// 用 express.json() 直接讀 body
// 多選投票：接收 { name, optionIds: ["d1010","d1011", ...] }
// 多選投票：{ name, optionIds: [...] }；同人同日只記一次
app.post("/api/vote", (req, res) => {
  const { name, optionIds } = req.body || {};
  if (!name || !Array.isArray(optionIds) || optionIds.length === 0) {
    return res.status(400).json({ ok: false, msg: "缺少姓名或選項" });
  }

  const cleanName = String(name).trim().slice(0, 16);
  const validIds = optionIds.filter(id => config.options.find(o => o.id === id));
  if (validIds.length === 0) return res.status(400).json({ ok: false, msg: "選項不存在" });

  const added = [];
  const skipped = [];

  validIds.forEach((optionId) => {
    if (!history[optionId]) history[optionId] = [];
    if (!nameSets[optionId]) nameSets[optionId] = new Set(history[optionId]);

    // 若已投過同一日期 → 略過，不加票、不丟 token
    if (nameSets[optionId].has(cleanName)) {
      skipped.push(optionId);
      return;
    }

    // 記錄姓名（歷史 & Set）
    history[optionId].push(cleanName);
    nameSets[optionId].add(cleanName);
    persistHistory();

    // 統計 +1
    stats[optionId] = (stats[optionId] || 0) + 1;
    fs.writeFileSync(STATS_JSON, JSON.stringify(stats, null, 2));

    // 流水
    const record = { ts: dayjs().toISOString(), optionId, name: cleanName };
    fs.appendFileSync(VOTES_LOG, JSON.stringify(record) + "\n");

    // 推播（讓對應罐子掉 token）
    const { label } = config.options.find(o => o.id === optionId);
    io.emit("vote", { optionId, label, name: cleanName, count: stats[optionId] });

    added.push(optionId);
  });

  return res.json({ ok: true, added, skipped });
});


// API：重置（管理時再用；可先註解避免誤按）
app.post("/api/reset", (_req, res) => {
  stats = {};
  persistStats();
  fs.writeFileSync(VOTES_LOG, "");
  io.emit("reset");
  res.json({ ok: true });
});

// 預設首頁：單頁版（左投票｜右動畫）
app.get("/", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "live.html"));
});

function csvCell(v){
  if (v === null || v === undefined) return "";
  const s = String(v);
  // 若含有逗號、雙引號或換行，就用雙引號包起來，並把內部雙引號變成兩個
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

app.get("/api/export-detail", (_req, res) => {
  const header = "option_id,option_label,name\n";
  let lines = [];
  config.options.forEach(opt => {
    const names = (history[opt.id] || []);
    names.forEach(n => {
      lines.push([
        csvCell(opt.id),
        csvCell(opt.label),
        csvCell(n)
      ].join(","));
    });
  });
  const csv = header + lines.join("\n") + "\n";
  const bom = "\uFEFF"; // UTF-8 BOM，讓 Excel 正確辨識中文
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="vote_details.csv"');
  res.send(bom + csv);
});

app.get("/api/export", (_req, res) => {
  const header = "id,name,count\n";
  const lines = (participants || []).map(p => [
    csvCell(p.id),
    csvCell(p.name),
    csvCell(stats[p.id] || 0)
  ].join(","));
  const csv = header + lines.join("\n") + "\n";
  const bom = "\uFEFF";
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="vote_results.csv"');
  res.send(bom + csv);
});


io.on("connection", (socket) => {
  socket.emit("snapshot", { config, stats, history });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Running at http://localhost:${PORT}`);
});
