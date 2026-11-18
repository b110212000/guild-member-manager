# FEV Guild Member Manager

FEV iPhone PWA，黑色棒球風介面，六個團別（第一～五團及無遊戲團）。正在切換到**兩份私人 Google Sheets 雙向同步**。

## 最新資料架構

- 私人 LINE Google Sheet 的 Members 工作表：LINE 成員 ID、名稱及更新紀錄。
- 私人遊戲 Google Sheet 的 Members 工作表：遊戲 ID、團別、隊伍、主／小號及對應 LINE 成員 ID。
- 遊戲 Sheet 的 Audit：操作人、時間、動作、修改摘要。
- Cloudflare Worker 負責 Google ID Token 驗證、管理員 Email 白名單、Google Sheets API 安全讀寫，前端不持有私密金鑰。
- FEV 前端登入後直接新增、編輯、刪除、移團與配對；定期重新同步並顯示衝突／錯誤。保留 PWA 圖示及 iPhone 主畫面安裝。

**重要**：目前沒有實際私人 Sheet IDs、Google OAuth 和 Worker Secrets。程式可以測試與發佈，但**直到設定完成，網站會顯示「尚未設定雙向同步」，不能視為已經串上正式名單**。既有 localStorage 資料沒有刪掉，但不會自動同步到 Google Sheets。為避免資料遺失，請保留舊資料備份。

詳細操作步驟：[私人 Google Sheets 設定教學](docs/google-sheets-setup.md)。

## 開發

Node.js 22：

    npm install
    npm test
    npm run build

Worker：

    cd worker
    npm install
    npm test
    npm run check

Vite 前端設定範本位於 .env.example。GitHub Pages 的公開設定需透過 Actions Variables FEV_API_BASE_URL 和 FEV_GOOGLE_CLIENT_ID 傳入。

Issue → feature branch → PR → CI → develop → release PR → main。程式碼只有在 CI 通過後合併。

## 安全與注意

本 repo 是 Public。請勿推送 Service Account JSON、PRIVATE_KEY、LINE 名單或遊戲名單。兩份 Google Sheets 都維持限制存取，Worker 使用 Server Secrets，不使用公開 CSV URL。

LINE 可對應多個遊戲帳號；不應僅根據遊戲 ID 猜測 LINE 身分。試算表編輯具基本版本衝突偵測，但非原子交易隔離。LINE/遊戲兩份 Sheets 的稽核寫入並非原子交易；請確認 auditWarning。

FEV PWA 仍可從 Safari 加入 iPhone 主畫面： https://b110212000.github.io/guild-member-manager/
