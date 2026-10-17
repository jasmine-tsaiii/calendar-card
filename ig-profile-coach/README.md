# IG 主頁健檢

貼上 Instagram 公開連結，AI 會幫你診斷個人首頁，並給出 3 個改寫方向。

## 功能

1. **讀取帳號**：貼上連結後，透過 Meta 官方 Business Discovery API 讀取該帳號的公開資料，包括名稱、簡介、連結、粉絲數，以及最近 9 則貼文的文字和圖片。
2. **讀不到時改用截圖**：個人帳號、尚未設定 API，或查詢次數達到上限時，可以上傳主頁截圖（最多 5 張），由 AI 看圖分析。
3. **六大面向評分**（各 1–5 分）：服務清楚度、個人特色、文字易讀性、行動呼籲、視覺一致性、信任感。每一項都會附上理由、觀察到的證據，以及改善方法。
4. **追問**：資訊不足時，AI 會提出 2–5 個問題。回答後可以重新產生更準確的建議。
5. **3 個改寫方向**：每個方向都包含名稱欄位、簡介（150 字元內，可一鍵複製）、精選動態分類和貼文企劃。
6. **台灣廣告法規提醒**：檢查文案是否可能觸犯醫療法、食安法、健康食品管理法、化粧品衛生安全管理法、藥事法或公平交易法，並提供較安全的寫法。

## 啟動

需要 Node.js 22 以上。

```bash
cd ig-profile-coach
npm install
cp .env.example .env   # 填入金鑰
npm start              # http://localhost:3000
```

只填 `ANTHROPIC_API_KEY` 也能使用，這時會走截圖分析。要讓「貼連結自動讀取」生效，還需要設定 Meta 的兩個變數，步驟見下一節。

## 設定 Meta API（貼連結自動讀取）

1. 準備一個你自己的 IG **專業帳號**（商業或創作者），並綁定一個 Facebook 粉絲專頁。
2. 到 [Meta for Developers](https://developers.facebook.com/) 建立 App，加入 Instagram Graph API（Instagram API with Facebook Login）。
3. 用 Graph API Explorer 產生 User Access Token，權限需要 `instagram_basic`、`pages_show_list`、`pages_read_engagement`。接著把它換成長效 Token（約 60 天）。
4. 查出你的 IG 帳號 ID：先用 `GET /me/accounts` 找到粉絲專頁，再用 `GET /{page-id}?fields=instagram_business_account` 取得 IG 帳號 ID。
5. 把 Token 填進 `META_ACCESS_TOKEN`，把 IG 帳號 ID 填進 `META_IG_USER_ID`。

> App 在**開發模式**下，只有 App 的管理員或測試人員能使用這組 Token。自己測試沒問題；要正式對外開放，需要送 Meta 的 App 審核。
> 這支 API **只能讀取專業帳號**。個人帳號會自動改走截圖分析。

## 合規設計

| 做法 | 原因 |
|---|---|
| 只使用 Meta 官方 API，不寫爬蟲、不登入假帳號 | 遵守 Meta 服務條款，資料來源合法 |
| 只在使用者貼上連結時查詢一個帳號，不做批量抓取 | 符合個資法「蒐集不得逾越特定目的之必要範圍」 |
| 使用前須勾選「我是此帳號本人或已取得授權」 | 目的明確，並取得當事人同意 |
| 資料不寫入資料庫，分析完即丟棄 | 降低個資保存風險 |
| 法規提醒標註「僅供參考，不構成法律意見」 | AI 判斷可能有誤 |

正式上線前建議補上隱私權政策頁，並請律師看過一次。

## 檔案結構

```
server.js           Express 伺服器與 API 路由
lib/instagram.js    解析 IG 連結，呼叫 Business Discovery API
lib/analyze.js      Claude 提示詞、輸出格式與分析邏輯
public/index.html   前端頁面
```
