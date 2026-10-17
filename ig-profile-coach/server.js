import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { fetchInstagramProfile, parseInstagramUsername } from "./lib/instagram.js";
import { analyzeProfile } from "./lib/analyze.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const client = new Anthropic();

// 截圖以 base64 傳上來，所以放寬 body 上限
app.use(express.json({ limit: "25mb" }));
app.use(express.static(path.join(here, "public")));

// 第一步：貼上連結 → 透過 Meta 官方 Business Discovery API 取得公開資料
app.post("/api/profile", async (req, res) => {
  const username = parseInstagramUsername(req.body?.url ?? "");
  if (!username) {
    return res.status(400).json({ error: "看不懂這個連結，請貼上像 https://www.instagram.com/帳號名稱 的網址。" });
  }
  try {
    const profile = await fetchInstagramProfile(username);
    res.json({ profile });
  } catch (err) {
    // 抓不到時回傳原因，前端會改請使用者上傳截圖或貼上簡介
    res.status(err.status ?? 502).json({ error: err.message, username, fallback: true });
  }
});

// 第二步：AI 診斷（可附上補充資訊、截圖、追問的回答）
app.post("/api/analyze", async (req, res) => {
  const { profile, extraInfo, answers, screenshots } = req.body ?? {};
  if (!profile && !(screenshots?.length)) {
    return res.status(400).json({ error: "需要先取得帳號資料，或至少上傳一張主頁截圖。" });
  }
  try {
    const report = await analyzeProfile(client, { profile, extraInfo, answers, screenshots });
    res.json({ report });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: "目前使用量太大，請稍後再試。" });
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Claude API error", err.status, err.message);
      return res.status(502).json({ error: "AI 分析服務暫時無法使用，請稍後再試。" });
    }
    console.error(err);
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      return res.status(503).json({ error: "伺服器尚未設定 ANTHROPIC_API_KEY，請管理員設定後再試。" });
    }
    res.status(500).json({ error: err.message ?? "分析失敗" });
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`IG 主頁健檢 running at http://localhost:${port}`));
