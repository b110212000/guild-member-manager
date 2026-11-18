# FEV 私人 Google Sheets 雙向同步設定

## 重要狀態

目前已完成的只有應用程式、Worker API 與單元測試。**尚未取得私人 Sheets ID、Google Cloud 金鑰與實際管理員名單，所以不能宣稱雲端同步已連線成功**。

公開的 GitHub Repo 不可提交真實 LINE 名單、Google Service Account JSON 或任何 Private Key。
舊的 localStorage 資料仍留在舊裝置，但新 Google Sheets 模式**不會自動轉移**。先確認原本資料有備份再做搬移。

## 兩份私人 Sheet

第一份 LINE 試算表內，建立名為 Members 的工作表。第一列 A:E 必須是：

    id | lineName | updatedAt | updatedBy | deletedAt

第二份遊戲試算表內，建立名為 Members 的工作表。第一列 A:I 必須是：

    id | group | gameId | team | accountType | lineId | updatedAt | updatedBy | deletedAt

第二份遊戲試算表內，再建立名為 Audit 的工作表。第一列 A:G 必須是：

    at | actor | action | entity | entityId | before | after

兩份試算表都保持**限制存取**，不要開放任何人持有連結。由系統產生 id、updatedAt、deletedAt；遊戲的 lineId 指向 LINE Members 的 id。同一 LINE id 可以連接本號與小號。

刪除採軟刪除（將 deletedAt 寫入時間）。遊戲資料只有第一至第五團，必要時也可標記「無遊戲團」。

## Google Cloud 設定

1. 建立 Google Cloud 專案並啟用 Google Sheets API。
2. 建立 Service Account，產生服務帳號 JSON Key。這個 JSON **只放安全位置，絕不貼到 Issue、聊天、GitHub Repo**。
3. 將兩份私人 Sheets 透過「共用」分別給 Service Account 的 client_email，權限為編輯者。
4. 建立 Web application 類型的 Google OAuth Client ID，Authorized JavaScript origin 設為 https://b110212000.github.io （本機開發可加 http://localhost:5173）。
5. 若 OAuth 仍在測試模式，將所有管理員帳號加入 Test users。
6. 從兩份 Google Sheet 網址中的 /d/ID/edit 取得各自 Spreadsheet ID，保持私人。

## Worker 配置

在 worker 目錄執行：

    npm install
    npm test
    npm run check
    npx wrangler login
    npx wrangler deploy

部署後，請**分別使用** npx wrangler secret put 指令設定以下 Secrets：

    GOOGLE_SERVICE_ACCOUNT_EMAIL
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
    GOOGLE_CLIENT_ID
    ADMIN_EMAILS
    LINE_SHEET_ID
    GAME_SHEET_ID
    ALLOWED_ORIGIN

GOOGLE_SERVICE_ACCOUNT_EMAIL 是 JSON 的 client_email，GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY 是 private_key（含 PEM 標頭）。
GOOGLE_CLIENT_ID 為 Google OAuth Web Client ID；ADMIN_EMAILS 是允許登入的 Google Email，以逗號分隔。
ALLOWED_ORIGIN 固定為 https://b110212000.github.io（不帶尾斜線）。
LINE_SHEET_ID、GAME_SHEET_ID 只能放 Worker Secrets，**不要放 Vite 前端**。

本機測試用 worker/.dev.vars 輸入上述 Secret，不要推送 GitHub。請使用 Cloudflare 儀表板 Secrets 或 wrangler secret put，避免把金鑰寫進命令列歷史。

## GitHub Pages 設定

到 Repository → Settings → Secrets and variables → Actions → Variables，設定以下**公開設定值**：

- FEV_API_BASE_URL：Worker 對外網址，例如 https://fev-roster-api.example.workers.dev
- FEV_GOOGLE_CLIENT_ID：同一個 OAuth Web Client ID

這兩個值可以放到網站 JS，不是私鑰。部署 workflow 已設定將 Actions Variables 傳入 Vite build。

在 GitHub Actions 重新執行 main 上的 Deploy GitHub Pages，新的 main 網站就會顯示 Google 管理員登入。若未提供值，網站只會顯示「Google Sheets 雙向同步尚未啟用」，不會誤顯示已同步狀態，也不會暗中以 localStorage 冒充雲端。

## 端到端驗收

- 未登入及非白名單帳號都不可讀寫。
- 管理員 A 登入，看到 Sheets LINE 和遊戲兩份名單；建立 LINE 成員立即寫入第一份 Sheet。
- 新增兩個不同遊戲 ID、相同 lineId，對應本號與小號，寫入第二份 Sheet。
- 管理員 B 在另一裝置登入並重新整理可看到 A 的修改。
- B 移動角色團別後，A 用舊資料修改會得到衝突提示。
- 使用中的 LINE 成員無法直接刪除；需先解除對應遊戲角色。
- 操作紀錄寫到第二份 Sheet 的 Audit 頁。
- iPhone PWA 的雲端資料需要網路，離線僅能啟動 App 外殼。

## 限制

此版用 updatedAt 做一般樂觀衝突檢查，但 Google Sheets 沒有提供整個讀寫過程的原子交易保護。多人毫秒級同時改同一列，仍可能競爭。若高頻編輯需加入 Durable Object 排隊鎖。

兩份 Sheets 和 Audit 並非跨文件原子交易。如果資料寫入成功，但 Audit 寫入失敗，API 會回 auditWarning，請檢查私人 Sheets 權限並補查記錄。
