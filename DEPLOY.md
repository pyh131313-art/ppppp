# 雲端部署

這個 Discord bot 需要放在 24 小時運作的主機上，電腦關機後才不會離線。

## Render 部署

1. 把專案推到 GitHub。
2. 到 Render 建立 Blueprint，選這個 GitHub repo。
3. Render 會讀取 `render.yaml` 建立 web service。Discord bot 會和網頁面板在同一個服務內一起運作，資料共用同一份 SQLite。
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

6. 部署完成後，服務 log 看到 `Web 面板已啟動`、`已登入：傳送器#0051` 和 slash commands 註冊完成就成功。

玩家資料會優先存到 SQLite：`/var/data/players.sqlite`。第一次啟動時會自動把舊的 `/var/data/players.json` 匯入 SQLite。

網頁面板部署後可直接打開 Render 網址，玩家用 Discord 登入即可查看自己的礦場資料、包包、雞舍與集幣冊。

## 指令註冊

如果之後新增或修改 slash commands，先在本機跑：

```bash
pnpm run register
```

## 重要

- 不要把 `.env` 上傳到 GitHub。
- 如果 token 曾經貼到聊天室或公開地方，請到 Discord Developer Portal 重設 token。
- 沒有 persistent disk 的雲端服務，重啟或重新部署後玩家資料可能會消失。
