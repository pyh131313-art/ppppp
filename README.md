# 挖礦 Discord 遊戲

這是一個 Discord slash command 小遊戲。玩家可以挖礦取得金幣與生鏽錢幣，再把它們變成不同種類的收藏紀念幣；挖到兩次炸彈就會死亡。

## 功能

- `/挖礦`：挖一次礦。
- `/礦場`：打開按鈕式視覺面板，可以直接點按鈕挖礦、看包包、除鏽、兌換與復活。
- `/包包`：查看 12 格紀念幣包包。正式紀念幣同種類堆疊，生鏽紀念幣每一枚佔一格。
- `/狀態`：查看生死狀態與炸彈次數。
- `/兌換`：用 10 金幣鑄造 1 枚隨機收藏紀念幣。
- `/除鏽`：把生鏽錢幣變成隨機收藏紀念幣，成功率 70%。
- `/丟棄`：丟棄包包裡的生鏽紀念幣或正式紀念幣。
- `/復活`：死亡後等待 10 分鐘免費復活，或花 20 金幣立刻復活。

## 啟動方式

1. 安裝依賴：

```bash
pnpm install
```

2. 建立 `.env`：

```bash
cp .env.example .env
```

3. 到 Discord Developer Portal 建立 Bot，填入：

```text
DISCORD_TOKEN=你的_bot_token
DISCORD_CLIENT_ID=你的_application_client_id
DISCORD_GUILD_ID=你的測試伺服器_id
# 多伺服器可改用：DISCORD_GUILD_IDS=伺服器1,伺服器2
```

4. 註冊 slash commands：

```bash
pnpm run register
```

5. 啟動 bot：

```bash
pnpm start
```

啟動後也會開啟 Web 面板，預設網址是：

```text
http://localhost:3000
```

若要使用 Discord 登入，需在 `.env` 填入 `DISCORD_CLIENT_SECRET`、`DISCORD_REDIRECT_URI`、`WEB_SESSION_SECRET`，並到 Discord Developer Portal 的 OAuth2 Redirects 加入相同的 callback URL。

## 遊戲數值

目前機率與價格都在 `src/config.js`。

預設挖礦機率：

- 金幣：45%
- 生鏽錢幣：35%
- 空的：10%
- 炸彈：10%

資料會儲存在 `data/players.json`。

收藏紀念幣資料在 `src/config.js`，圖片素材放在 `assets/collectibles/`。
