# 雲端部署

這個 Discord bot 需要放在 24 小時運作的主機上，電腦關機後才不會離線。

## Render 部署

1. 把專案推到 GitHub。
2. 到 Render 建立 Blueprint，選這個 GitHub repo。
3. Render 會讀取 `render.yaml` 建立 background worker。
4. 在 Render 填入環境變數：

```text
DISCORD_TOKEN=新的_bot_token
DISCORD_CLIENT_ID=1494439644207775795
DISCORD_GUILD_ID=1313180465942888508
```

5. 確認 worker 有掛載 persistent disk：

```text
Mount path: /var/data
DATA_FILE: /var/data/players.json
```

6. 部署完成後，服務 log 看到 `已登入：傳送器#0051` 就成功。

## 指令註冊

如果之後新增或修改 slash commands，先在本機跑：

```bash
pnpm run register
```

## 重要

- 不要把 `.env` 上傳到 GitHub。
- 如果 token 曾經貼到聊天室或公開地方，請到 Discord Developer Portal 重設 token。
- 沒有 persistent disk 的雲端服務，重啟或重新部署後玩家資料可能會消失。
