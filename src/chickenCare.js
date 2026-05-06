"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { getPlayer } = require("./playerState");

const CHICKEN_PK_PREFIX = "chicken_pk";
const CHICKEN_UPGRADE_PREFIX = "chicken_upgrade";
const CHICKEN_PANEL_PREFIX = "chicken_panel";
const PK_FRAME_COUNT = 6;
const PK_TRACK_LENGTH = 14;
const PK_TIMEOUT_MS = 60 * 1000;

const PERSONALITIES = [
  { id: "charger", label: "🔥 暴衝型", speed: 1, sprint: 2, stability: -1, stamina: -1, openBurst: 0.18, latePenalty: 0.25 },
  { id: "veteran", label: "🐢 老油條", speed: -1, sprint: 0, stability: 2, stamina: 2, comeback: 0.18 },
  { id: "gambler", label: "🎲 賭狗型", speed: 0, sprint: 1, stability: -1, stamina: 0, swing: 0.35 },
  { id: "sleepy", label: "😴 睡覺型", speed: -1, sprint: 1, stability: 0, stamina: 2, late: 0.35 },
  { id: "sneaky", label: "😈 陰險型", speed: 0, sprint: 0, stability: 1, stamina: 0, interfere: 0.22 },
  { id: "madDog", label: "💀 瘋狗型", speed: 1, sprint: 3, stability: -2, stamina: -1, failRisk: 0.22 },
  { id: "steady", label: "🛡️ 穩健型", speed: 0, sprint: -1, stability: 3, stamina: 1, resist: 0.28 },
  { id: "chosen", label: "✨ 天選型", speed: 1, sprint: 1, stability: 1, stamina: 1, rare: 0.12 }
];

const BASE_NAMES = ["小咕", "阿雞", "咕咕", "雞腿", "金冠", "小翅"];
const activeChickenBattles = new Map();
const activeBattleByPlayerId = new Map();

function clampStat(value) {
  return Math.max(1, Math.min(20, Math.floor(value || 1)));
}

function getPersonality(id) {
  return PERSONALITIES.find((item) => item.id === id) || PERSONALITIES[0];
}

function makeOwnedChicken(random = Math.random) {
  const personality = PERSONALITIES[Math.floor(random() * PERSONALITIES.length)] || PERSONALITIES[0];
  const roll = () => 4 + Math.floor(random() * 4);
  return {
    id: `${Date.now()}-${Math.floor(random() * 100000)}`,
    name: BASE_NAMES[Math.floor(random() * BASE_NAMES.length)] || "小咕",
    personalityId: personality.id,
    level: 1,
    exp: 0,
    speed: clampStat(roll() + personality.speed),
    sprint: clampStat(roll() + personality.sprint),
    stability: clampStat(roll() + personality.stability),
    stamina: clampStat(roll() + personality.stamina),
    wins: 0,
    races: 0,
    levelUpOptions: []
  };
}

function normalizeOwnedChicken(input) {
  if (!input || typeof input !== "object") return null;
  const personality = getPersonality(input.personalityId);
  return {
    id: input.id || `${Date.now()}-legacy`,
    name: String(input.name || "小咕").slice(0, 12),
    personalityId: personality.id,
    level: Math.max(1, Math.floor(input.level || 1)),
    exp: Math.max(0, Math.floor(input.exp || 0)),
    speed: clampStat(input.speed || 5),
    sprint: clampStat(input.sprint || 5),
    stability: clampStat(input.stability || 5),
    stamina: clampStat(input.stamina || 5),
    wins: Math.max(0, Math.floor(input.wins || 0)),
    races: Math.max(0, Math.floor(input.races || 0)),
    levelUpOptions: Array.isArray(input.levelUpOptions)
      ? input.levelUpOptions.filter((id) => getUpgradePool().some((option) => option.id === id)).slice(0, 3)
      : []
  };
}

function ensureOwnedChicken(playerInput, random = Math.random) {
  const player = getPlayer(playerInput);
  if (!player.ownedChicken) player.ownedChicken = makeOwnedChicken(random);
  return player;
}

function sanitizeChickenName(name) {
  const cleaned = String(name || "").trim().replace(/[^\p{L}\p{N}_\-\u4e00-\u9fffぁ-んァ-ンㄅ-ㄩ]/gu, "");
  const banned = ["幹", "操", "死"];
  if (cleaned.length < 2 || cleaned.length > 12) return null;
  if (banned.some((word) => cleaned.includes(word))) return null;
  return cleaned;
}

function renameChicken(playerInput, name, random = Math.random) {
  const player = ensureOwnedChicken(playerInput, random);
  const cleaned = sanitizeChickenName(name);
  if (!cleaned) return { ok: false, player, message: "雞名需要 2~12 字，不能空白或包含特殊符號。" };
  player.ownedChicken.name = cleaned;
  return { ok: true, player, message: `🐔 你的雞現在叫做：\n「${cleaned}」` };
}

function getExpToLevel(chicken) {
  return Math.max(40, chicken.level * 50);
}

function getUpgradePool() {
  return [
    { id: "speed", label: "速度 +1", apply: (chicken) => { chicken.speed = clampStat(chicken.speed + 1); } },
    { id: "sprint", label: "衝刺 +1", apply: (chicken) => { chicken.sprint = clampStat(chicken.sprint + 1); } },
    { id: "stability", label: "穩定 +1", apply: (chicken) => { chicken.stability = clampStat(chicken.stability + 1); } },
    { id: "stamina", label: "耐力 +1", apply: (chicken) => { chicken.stamina = clampStat(chicken.stamina + 1); } },
    { id: "balanced", label: "速度/穩定 +1", apply: (chicken) => {
      chicken.speed = clampStat(chicken.speed + 1);
      chicken.stability = clampStat(chicken.stability + 1);
    } },
    { id: "finisher", label: "衝刺/耐力 +1", apply: (chicken) => {
      chicken.sprint = clampStat(chicken.sprint + 1);
      chicken.stamina = clampStat(chicken.stamina + 1);
    } }
  ];
}

function rollUpgradeOptions(random = Math.random) {
  const pool = getUpgradePool();
  const options = [];
  while (options.length < 3 && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    options.push(pool.splice(index, 1)[0].id);
  }
  return options;
}

function addChickenExp(player, amount, random = Math.random) {
  const chicken = player.ownedChicken;
  if (!chicken) return "";
  chicken.exp += Math.max(0, Math.floor(amount || 0));
  const messages = [];
  while (chicken.exp >= getExpToLevel(chicken) && chicken.levelUpOptions.length === 0) {
    chicken.exp -= getExpToLevel(chicken);
    chicken.level += 1;
    chicken.levelUpOptions = rollUpgradeOptions(random);
    messages.push(`✨ ${chicken.name} 升到 Lv.${chicken.level}，可選擇成長方向。`);
  }
  return messages.join("\n");
}

function chooseChickenUpgrade(playerInput, optionId) {
  const player = getPlayer(playerInput);
  const chicken = player.ownedChicken;
  if (!chicken || !chicken.levelUpOptions.length) return { ok: false, player, message: "目前沒有可選的雞升級。" };
  if (!chicken.levelUpOptions.includes(optionId)) return { ok: false, player, message: "這個升級選項目前沒有出現。" };
  const option = getUpgradePool().find((item) => item.id === optionId);
  if (!option) return { ok: false, player, message: "找不到這個升級。" };
  option.apply(chicken);
  chicken.levelUpOptions = [];
  return { ok: true, player, message: `已選擇：${option.label}。` };
}

function formatOwnedChicken(playerInput) {
  const player = ensureOwnedChicken(playerInput);
  const chicken = player.ownedChicken;
  const personality = getPersonality(chicken.personalityId);
  const upgradeLine = chicken.levelUpOptions.length
    ? `\n\n✨ 可升級：${chicken.levelUpOptions.map((id) => getUpgradePool().find((item) => item.id === id).label).join("｜")}`
    : "";
  return [
    `🐔 ${chicken.name}`,
    "",
    `等級：${chicken.level}｜經驗：${chicken.exp}/${getExpToLevel(chicken)}`,
    `性格：${personality.label}`,
    "",
    `速度：${chicken.speed}`,
    `衝刺：${chicken.sprint}`,
    `穩定：${chicken.stability}`,
    `耐力：${chicken.stamina}`,
    "",
    `勝場：${chicken.wins}`,
    `出賽：${chicken.races}`,
    upgradeLine
  ].join("\n");
}

function buildChickenEmbed(playerInput, title = "我的雞", message = "") {
  const player = ensureOwnedChicken(playerInput);
  return new EmbedBuilder()
    .setColor(0xfacc15)
    .setTitle(title)
    .setDescription([message, formatOwnedChicken(player)].filter(Boolean).join("\n\n").slice(0, 4096));
}

function buildChickenUpgradeComponents(playerInput) {
  const player = getPlayer(playerInput);
  const chicken = player.ownedChicken;
  if (!chicken || !chicken.levelUpOptions.length) return [];
  return [
    new ActionRowBuilder().addComponents(...chicken.levelUpOptions.map((id) => {
      const option = getUpgradePool().find((item) => item.id === id);
      return new ButtonBuilder()
        .setCustomId(`${CHICKEN_UPGRADE_PREFIX}:${id}`)
        .setLabel(option ? option.label : id)
        .setEmoji("✨")
        .setStyle(ButtonStyle.Primary);
    }))
  ];
}

function buildChickenPanelComponents(playerInput, ownerId = "none") {
  const player = getPlayer(playerInput);
  const upgradeRows = buildChickenUpgradeComponents(player);
  return [
    ...upgradeRows,
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CHICKEN_PANEL_PREFIX}:rename:${ownerId}`)
        .setLabel("命名")
        .setEmoji("✏️")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${CHICKEN_PANEL_PREFIX}:roast:${ownerId}`)
        .setLabel("烤雞")
        .setEmoji("🍗")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${CHICKEN_PANEL_PREFIX}:refresh:${ownerId}`)
        .setLabel("刷新")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function getChickenPower(chicken, frameIndex, event, random = Math.random) {
  const personality = getPersonality(chicken.personalityId);
  const progress = (frameIndex + 1) / PK_FRAME_COUNT;
  let step = 0.55
    + chicken.speed * 0.13
    + chicken.sprint * 0.05
    + chicken.stamina * progress * 0.07
    + (random() - 0.5) * 0.8;
  if (personality.openBurst && progress < 0.35 && random() < personality.openBurst) step += 2.2;
  if (personality.late && progress > 0.55) step += personality.late * 2;
  if (personality.comeback && progress > 0.65) step += personality.comeback * 2;
  if (personality.swing) step += (random() - 0.4) * personality.swing * 5;
  if (personality.rare && random() < personality.rare) step += 2.5;
  if (personality.latePenalty && progress > 0.65) step -= personality.latePenalty * 2;
  if (personality.failRisk && random() < personality.failRisk) step -= 1.8;
  if (event === "衝刺") step += chicken.sprint * 0.18;
  if (event === "體力耗盡") step -= Math.max(0, 2.2 - chicken.stamina * 0.16);
  if (event === "終點爆衝" && progress > 0.65) step += chicken.sprint * 0.25;
  return Math.max(0, step);
}

function applyPkEvent(left, right, event, random = Math.random) {
  const all = [left, right];
  const target = all[Math.floor(random() * all.length)];
  const other = target === left ? right : left;
  const personality = getPersonality(target.chicken.personalityId);
  if (event === "跌倒") {
    const resist = target.chicken.stability * 0.04 + (personality.resist || 0);
    if (random() > resist) target.position -= 2.4;
  }
  if (event === "干擾") {
    const sneakyBonus = getPersonality(target.chicken.personalityId).interfere || 0;
    if (random() < 0.45 + sneakyBonus) other.position -= 1.6;
  }
  if (event === "逆轉") {
    const behind = left.position <= right.position ? left : right;
    behind.position += 2.8 + behind.chicken.stamina * 0.08;
  }
  for (const runner of all) runner.position = Math.max(0, Math.min(PK_TRACK_LENGTH, runner.position));
}

function buildPkTrack(runner) {
  const position = Math.max(0, Math.min(PK_TRACK_LENGTH, Math.floor(runner.position)));
  return `${"—".repeat(position)}${runner.chicken.name}${"—".repeat(PK_TRACK_LENGTH - position)}🏁`;
}

function createBattle(challengerId, targetId, players, now = Date.now(), random = Math.random, guildId = "global") {
  if (challengerId === targetId) return { ok: false, message: "不能挑戰自己。" };
  if (activeBattleByPlayerId.has(challengerId) || activeBattleByPlayerId.has(targetId)) {
    return { ok: false, message: "其中一位玩家已經在賽雞 PK 中。" };
  }
  const challenger = ensureOwnedChicken(players[challengerId], random);
  const target = ensureOwnedChicken(players[targetId], random);
  players[challengerId] = challenger;
  players[targetId] = target;
  const battle = {
    id: `${now}-${challengerId}-${targetId}`,
    guildId,
    status: "pending",
    challengerId,
    targetId,
    createdAt: now,
    expiresAt: now + PK_TIMEOUT_MS,
    runners: null,
    frames: [],
    result: null,
    timers: [],
    message: null
  };
  activeChickenBattles.set(battle.id, battle);
  activeBattleByPlayerId.set(challengerId, battle.id);
  activeBattleByPlayerId.set(targetId, battle.id);
  return { ok: true, battle, players };
}

function clearBattle(battleId) {
  const battle = activeChickenBattles.get(battleId);
  if (battle && Array.isArray(battle.timers)) {
    for (const timer of battle.timers) clearTimeout(timer);
  }
  if (battle) {
    activeBattleByPlayerId.delete(battle.challengerId);
    activeBattleByPlayerId.delete(battle.targetId);
  }
  activeChickenBattles.delete(battleId);
}

function getBattle(battleId) {
  return activeChickenBattles.get(battleId) || null;
}

function buildBattleComponents(battle) {
  if (!battle || battle.status !== "pending") return [];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CHICKEN_PK_PREFIX}:accept:${battle.id}`)
        .setLabel("接受 PK")
        .setEmoji("⚔️")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${CHICKEN_PK_PREFIX}:decline:${battle.id}`)
        .setLabel("拒絕")
        .setEmoji("✖️")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function buildBattleEmbed(battle, players, message = "") {
  const challenger = ensureOwnedChicken(players[battle.challengerId]);
  const target = ensureOwnedChicken(players[battle.targetId]);
  const frame = battle.frames[battle.frames.length - 1] || [
    `${challenger.ownedChicken.name}${"—".repeat(PK_TRACK_LENGTH)}🏁`,
    `${target.ownedChicken.name}${"—".repeat(PK_TRACK_LENGTH)}🏁`
  ].join("\n");
  return new EmbedBuilder()
    .setColor(battle.status === "settled" ? 0xfacc15 : 0xef4444)
    .setTitle("1v1 賽雞 PK")
    .setDescription([
      message,
      `<@${battle.challengerId}>：${challenger.ownedChicken.name}`,
      `<@${battle.targetId}>：${target.ownedChicken.name}`,
      "",
      frame
    ].filter(Boolean).join("\n").slice(0, 4096));
}

function updateBattleFrame(battle, players, frameIndex, random = Math.random) {
  if (!battle.runners) {
    const challenger = ensureOwnedChicken(players[battle.challengerId]);
    const target = ensureOwnedChicken(players[battle.targetId]);
    battle.runners = [
      { userId: battle.challengerId, chicken: { ...challenger.ownedChicken }, position: 0 },
      { userId: battle.targetId, chicken: { ...target.ownedChicken }, position: 0 }
    ];
  }
  const events = ["衝刺", "跌倒", "干擾", "逆轉", "體力耗盡", "終點爆衝"];
  const event = events[Math.floor(random() * events.length)] || "衝刺";
  for (const runner of battle.runners) {
    runner.position += getChickenPower(runner.chicken, frameIndex, event, random);
  }
  applyPkEvent(battle.runners[0], battle.runners[1], event, random);
  const hint = {
    衝刺: "💨 衝刺！",
    跌倒: "🍌 跌倒！",
    干擾: "😈 干擾！",
    逆轉: "🔥 逆轉！",
    體力耗盡: "💦 體力耗盡！",
    終點爆衝: "⚡ 終點爆衝！"
  }[event];
  const frame = [
    ...battle.runners.map((runner) => buildPkTrack(runner)),
    hint
  ].join("\n");
  battle.frames.push(frame);
  return frame;
}

function settleBattle(battle, players, random = Math.random) {
  if (!battle.runners) updateBattleFrame(battle, players, 0, random);
  battle.status = "settled";
  const sorted = [...battle.runners].sort((a, b) => b.position - a.position);
  const winner = sorted[0];
  const loser = sorted[1];
  const close = winner.position - loser.position < 1.5;
  if (close && random() < 0.18) {
    winner.position -= 0.6;
    loser.position += 1;
    sorted.reverse();
  }
  const finalWinner = sorted[0];
  const finalLoser = sorted[1];
  for (const runner of battle.runners) {
    const player = ensureOwnedChicken(players[runner.userId], random);
    const chicken = player.ownedChicken;
    chicken.races += 1;
    const won = runner.userId === finalWinner.userId;
    if (won) chicken.wins += 1;
    const exp = 18 + (won ? 32 : 10) + (close ? 8 : 0) + Math.floor(runner.position / 3);
    const levelMessage = addChickenExp(player, exp, random);
    players[runner.userId] = player;
    runner.levelMessage = levelMessage;
  }
  finalWinner.position = PK_TRACK_LENGTH;
  finalLoser.position = Math.max(0, Math.min(PK_TRACK_LENGTH - 2, finalLoser.position));
  const finalFrame = [
    "🏁 終點！",
    buildPkTrack(finalWinner),
    buildPkTrack(finalLoser),
    "",
    `🏆 勝利：${finalWinner.chicken.name}（<@${finalWinner.userId}>）`,
    ...battle.runners.map((runner) => runner.levelMessage).filter(Boolean)
  ].join("\n");
  battle.frames.push(finalFrame);
  battle.result = { winnerId: finalWinner.userId, loserId: finalLoser.userId };
  activeBattleByPlayerId.delete(battle.challengerId);
  activeBattleByPlayerId.delete(battle.targetId);
  return { battle, players, message: finalFrame };
}

function isChickenPkComponent(customId) {
  return typeof customId === "string" && customId.startsWith(`${CHICKEN_PK_PREFIX}:`);
}

function isChickenUpgradeComponent(customId) {
  return typeof customId === "string" && customId.startsWith(`${CHICKEN_UPGRADE_PREFIX}:`);
}

function isChickenPanelComponent(customId) {
  return typeof customId === "string" && customId.startsWith(`${CHICKEN_PANEL_PREFIX}:`);
}

function roastOwnedChicken(playerInput) {
  const player = getPlayer(playerInput);
  if (!player.ownedChicken) return { ok: false, player, message: "你目前沒有自己的雞。" };
  const chicken = player.ownedChicken;
  player.chickenRoastHpBonus = (player.chickenRoastHpBonus || 0) + 1;
  player.ownedChicken = null;
  return {
    ok: true,
    player,
    message: `🍗 你烤掉了「${chicken.name}」。\n牠陪你贏過 ${chicken.wins} 場比賽。\n下一場下礦最大生命 +1。`
  };
}

module.exports = {
  CHICKEN_PK_PREFIX,
  CHICKEN_PANEL_PREFIX,
  CHICKEN_UPGRADE_PREFIX,
  PK_FRAME_COUNT,
  PERSONALITIES,
  buildBattleComponents,
  buildBattleEmbed,
  buildChickenEmbed,
  buildChickenPanelComponents,
  buildChickenUpgradeComponents,
  chooseChickenUpgrade,
  clearBattle,
  createBattle,
  ensureOwnedChicken,
  formatOwnedChicken,
  getBattle,
  isChickenPkComponent,
  isChickenPanelComponent,
  isChickenUpgradeComponent,
  normalizeOwnedChicken,
  renameChicken,
  roastOwnedChicken,
  settleBattle,
  updateBattleFrame
};
