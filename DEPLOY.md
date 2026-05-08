# 雲端部署

這個 Discord bot 需要放在 24 小時運作的主機上，電腦關機後才不會離線。

## Render 部署

1. 把專案推到 GitHub。
2. 到 Render 建立 Blueprint，選這個 GitHub repo。
3. Render 會讀取 `render.yaml` 建立 web service。若要同時跑 Discord bot，建議另外建立 Background Worker，兩個服務共用同一個 PostgreSQL。
4. 在 Render 填入環境變數：

```text
DISCORD_TOKEN=新的_bot_token
DISCORD_CLIENT_ID=1494439644207775795
DISCORD_CLIENT_SECRET=Discord Developer Portal 的 OAuth2 Secret
DISCORD_REDIRECT_URI=https://你的-render網址.onrender.com/auth/discord/callback
WEB_SESSION_SECRET=一串很長的隨機字
DISCORD_GUILD_ID=1313180465942888508
```

同時要到 Discord Developer Portal → OAuth2 → Redirects 加入同一個 `DISCORD_REDIRECT_URI`。

如果要同時註冊多個伺服器，改用逗號分隔：

```text
DISCORD_GUILD_IDS=1313180465942888508,另一個伺服器ID
```

5. 確認 worker 有掛載 persistent disk：

```text
Mount path: /var/data
DATA_FILE: /var/data/players.json
DATABASE_FILE: /var/data/players.sqlite
```

6. 部署完成後，web 服務 log 看到 `Web 面板已啟動` 就成功。Background Worker 看到 `已登入：傳送器#0051` 和 slash commands 註冊完成就成功。

玩家資料會優先存到 SQLite：`/var/data/players.sqlite`。第一次啟動時會自動把舊的 `/var/data/players.json` 匯入 SQLite。

網頁面板部署後可直接打開 Render 網址，玩家用 Discord 登入即可查看自己的礦場資料、包包、雞舍與集幣冊。

## PostgreSQL 即時同步

如果 Discord bot 和 Web 面板分成不同 Render 服務，SQLite / Render Disk 不會同步。要讓兩邊即時讀同一份資料，請改用 PostgreSQL。

1. 建立 Render PostgreSQL、Supabase 或 Neon 資料庫。
2. 在所有會讀寫玩家資料的服務都設定同一組：

```text
DATABASE_URL=postgresql://...
STORAGE_BACKEND=postgres
POSTGRES_SSL=true
```

如果 `DATABASE_URL` 已存在但沒有設定 `STORAGE_BACKEND`，程式也會自動優先使用 PostgreSQL。

3. 如果舊資料在 Background Worker 的 SQLite / Render Disk，第一次切換該 worker 到 PostgreSQL 時，可以只在 worker 加上：

```text
POSTGRES_MIGRATE_FROM_SQLITE=true
```

程式會在 PostgreSQL 還是空資料庫時，把 `/var/data/players.sqlite` 自動搬進 PostgreSQL。看到 log 顯示搬家完成後，建議移除這個環境變數，避免之後誤會。

4. 若不使用自動搬家，也可以先在舊服務使用 `/匯出玩家資料` 下載 `players-export-xxxx.json.gz`。
5. 將新服務部署到 PostgreSQL 後，使用 `/匯入玩家資料` 上傳該檔案，確認文字輸入：

```text
覆蓋玩家資料
```

6. 匯入成功後，Discord bot 和 Web 面板會讀寫同一個 PostgreSQL 資料庫。

注意：明確使用 `STORAGE_BACKEND=postgres` 時，如果 PostgreSQL 連不上，程式會停止讀寫玩家資料，不會偷偷改用本機檔案，避免再次產生不同步資料。

## 指令註冊

如果之後新增或修改 slash commands，先在本機跑：

```bash
pnpm run register
```

## 重要

- 不要把 `.env` 上傳到 GitHub。
- 如果 token 曾經貼到聊天室或公開地方，請到 Discord Developer Portal 重設 token。
- 沒有 persistent disk 的雲端服務，重啟或重新部署後玩家資料可能會消失。
