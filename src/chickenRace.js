"use strict";

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { CONFIG } = require("./config");
const { getPlayer } = require("./game");

const RACE_CUSTOM_IDS = {
  prefix: "chicken_race",
  bet: "chicken_race:bet",
  start: "chicken_race:start",
  next: "chicken_race:next",
  roast: "chicken_race:roast"
};

const BETTING_MS = 90 * 1000;
const RACING_MS = 75 * 1000;
const FRAME_COUNT = 8;
const TRACK_LENGTH = 16;

const CHICKENS = [
  { id: "gugugu", emoji: "🐔", name: "故咕顧", style: "穩定", speed: 1.05, burst: 0.08, late: 0 },
  { id: "black", emoji: "🐓", name: "黑吉吉", style: "爆發", speed: 0.95, burst: 0.22, late: 0 },
  { id: "yellow", emoji: "🐤", name: "小黃", style: "慢熱", speed: 0.9, burst: 0.1, late: 0.35 },
  { id: "kfc", emoji: "🐔", name: "肯德基", style: "抗干擾", speed: 1, burst: 0.1, late: 0.1, resist: 0.45 },
  { id: "jj", emoji: "🐓", name: "ㄐㄐ", style: "高風險", speed: 1.1, burst: 0.3, late: 0, fallRisk: 0.18 },
  { id: "j8", emoji: "🐔", name: "J8", style: "後期爆發", speed: 0.88, burst: 0.12, late: 0.55 }
];

const RACE_EVENTS = [
  "起跑失誤",
  "神速衝刺",
  "香蕉皮",
  "觀眾歡呼",
  "高貴閃光",
  "雞群混亂",
  "突然打鳴",
  "體力耗盡",
  "神秘飼料",
  "終點爆衝"
];

const DEFAULT_RACE_SCOPE = "global";
const activeRaces = new Map();
const activeRacePanelByUserId = new Map();
const raceLock = new Set();
const roastPenalties = {};

function weightedSampleChickens(random = Math.random) {
  const pool = CHICKENS.map((chicken) => ({
    ...chicken,
    weight: roastPenalties[chicken.id] > 0 ? 0.5 : 1
  }));
  const selected = [];
  while (selected.length < 3 && pool.length > 0) {
    const total = pool.reduce((sum, item) => sum + item.weight, 0);
    let roll = random() * total;
    const index = pool.findIndex((item) => {
      roll -= item.weight;
      return roll < 0;
    });
    selected.push(pool.splice(index < 0 ? 0 : index, 1)[0]);
  }
  return selected.map(({ weight, ...chicken }) => chicken);
}

function decayRoastPenalties() {
  for (const key of Object.keys(roastPenalties)) {
    roastPenalties[key] -= 1;
    if (roastPenalties[key] <= 0) delete roastPenalties[key];
  }
}

function normalizeRaceScope(scopeKey = DEFAULT_RACE_SCOPE) {
  return scopeKey || DEFAULT_RACE_SCOPE;
}

function getRaceState(scopeKey = DEFAULT_RACE_SCOPE) {
  return activeRaces.get(normalizeRaceScope(scopeKey)) || null;
}

function getRaceId(race) {
  return race && race.id ? race.id : "unknown";
}

function buildRaceCustomId(race, action, ...parts) {
  return [RACE_CUSTOM_IDS.prefix, action, getRaceId(race), ...parts].join(":");
}

function parseRaceCustomId(customId) {
  const parts = typeof customId === "string" ? customId.split(":") : [];
  if (parts[0] !== RACE_CUSTOM_IDS.prefix) return null;
  const legacyAction = parts[1];
  if (legacyAction === "bet") {
    if (parts.length >= 5) return { action: "bet", raceId: parts[2], betType: parts[3], chickenId: parts[4], legacy: false };
    return { action: "bet", raceId: null, betType: parts[2], chickenId: parts[3], legacy: true };
  }
  if (legacyAction === "roast") {
    if (parts.length >= 4) return { action: "roast", raceId: parts[2], chickenId: parts[3], legacy: false };
    return { action: "roast", raceId: null, chickenId: parts[2], legacy: true };
  }
  if (legacyAction === "start" || legacyAction === "next") {
    return { action: legacyAction, raceId: parts[2] || null, legacy: parts.length < 3 };
  }
  return null;
}

function isCurrentRaceComponent(race, customId) {
  const parsed = parseRaceCustomId(customId);
  if (!parsed || !race) return false;
  return !parsed.raceId || parsed.raceId === race.id;
}

function resetRaceState(scopeKey = null) {
  if (scopeKey === null) {
    for (const race of activeRaces.values()) {
      if (!race || !Array.isArray(race.timers)) continue;
      for (const timer of race.timers) clearTimeout(timer);
    }
    activeRaces.clear();
    activeRacePanelByUserId.clear();
    raceLock.clear();
    return;
  }
  const normalized = normalizeRaceScope(scopeKey);
  const race = activeRaces.get(normalized);
  if (race && Array.isArray(race.timers)) {
    for (const timer of race.timers) clearTimeout(timer);
  }
  activeRaces.delete(normalized);
  for (const [userId, scope] of activeRacePanelByUserId.entries()) {
    if (scope === normalized) activeRacePanelByUserId.delete(userId);
  }
  raceLock.delete(normalized);
}

function clearRacePanelForScope(scopeKey) {
  const normalized = normalizeRaceScope(scopeKey);
  for (const [userId, scope] of activeRacePanelByUserId.entries()) {
    if (scope === normalized) activeRacePanelByUserId.delete(userId);
  }
}

function startRace(now = Date.now(), random = Math.random, scopeKey = DEFAULT_RACE_SCOPE, userId = null) {
  const normalized = normalizeRaceScope(scopeKey);
  if (userId && activeRacePanelByUserId.has(userId)) {
    const userRace = activeRaces.get(activeRacePanelByUserId.get(userId));
    if (userRace && userRace.status !== "settled") return userRace;
  }
  const activeRace = activeRaces.get(normalized);
  if (activeRace && activeRace.status !== "settled") return activeRace;
  clearRacePanelForScope(normalized);
  decayRoastPenalties();
  const race = {
    id: `${now}`,
    scopeKey: normalized,
    status: "betting",
    createdAt: now,
    bettingEndsAt: now + BETTING_MS,
    racingEndsAt: null,
    selectedChickens: weightedSampleChickens(random),
    playersInMatch: {},
    raceFrames: [],
    result: null,
    message: null,
    timers: []
  };
  activeRaces.set(normalized, race);
  if (userId) activeRacePanelByUserId.set(userId, normalized);
  return race;
}

function getChicken(race, chickenId) {
  return race.selectedChickens.find((chicken) => chicken.id === chickenId) || null;
}

function getPlayerTicket(race, userId) {
  return race && race.playersInMatch ? race.playersInMatch[userId] || null : null;
}

function buyTicket(race, userId, betType, chickenId, player) {
  if (!race || race.status !== "betting") return { ok: false, player, message: "目前沒有可下注的賽雞。" };
  if (getPlayerTicket(race, userId)) return { ok: false, player, message: "每人每場最多只能買 1 張票。" };
  const chicken = getChicken(race, chickenId);
  if (!chicken) return { ok: false, player, message: "這隻雞沒有出賽。" };
  const cost = betType === "noble" ? 10000 : 1000;
  if (player.gold < cost) return { ok: false, player, message: `金幣不足，${betType === "noble" ? "高貴票" : "普通票"}需要 ${cost} 金幣。` };
  player.gold -= cost;
  race.playersInMatch[userId] = { userId, betType, chickenId, cost };
  activeRacePanelByUserId.set(userId, race.scopeKey || DEFAULT_RACE_SCOPE);
  return {
    ok: true,
    player,
    message: `已購買${betType === "noble" ? "✨ 高貴票" : "普通票"}：${chicken.emoji} ${chicken.name}。`
  };
}

function roastChicken(race, chickenId, player) {
  if (!race || race.status !== "betting") return { ok: false, player, message: "只能在下注階段烤雞。" };
  const chicken = getChicken(race, chickenId);
  if (!chicken) return { ok: false, player, message: "這隻雞沒有出賽。" };
  if (player.gold < 5000) return { ok: false, player, message: "烤雞需要 5000 金幣。" };
  player.gold -= 5000;
  player.chickenRoastHpBonus = (player.chickenRoastHpBonus || 0) + 1;
  roastPenalties[chickenId] = 3;
  return {
    ok: true,
    player,
    message: `你烤了 ${chicken.emoji} ${chicken.name}。下一局下礦最大生命 +1，牠接下來 3 場出場率下降。`
  };
}

function applyEvent(chickens, event, random = Math.random) {
  const target = chickens[Math.floor(random() * chickens.length)];
  const sorted = [...chickens].sort((a, b) => b.position - a.position);
  if (event === "起跑失誤") target.position -= 1.2;
  if (event === "神速衝刺") target.position += 2.2;
  if (event === "香蕉皮" && random() > (target.resist || 0)) target.position -= 2;
  if (event === "觀眾歡呼") sorted[0].position += 1.2;
  if (event === "高貴閃光") target.position += 1.5;
  if (event === "雞群混亂") chickens.reverse();
  if (event === "突然打鳴") sorted[sorted.length - 1].position += 2.4;
  if (event === "體力耗盡") sorted[0].position -= 1.6;
  if (event === "神秘飼料") target.position += random() < 0.5 ? 2 : -1.8;
  if (event === "終點爆衝") target.position += 3;
  return target;
}

function buildTrack(chicken) {
  const position = Math.max(0, Math.min(TRACK_LENGTH, Math.floor(chicken.position)));
  return `${"—".repeat(position)}${chicken.emoji}${"—".repeat(TRACK_LENGTH - position)}🏁`;
}

function updateRaceFrame(race, frameIndex, random = Math.random) {
  const progress = (frameIndex + 1) / FRAME_COUNT;
  const runners = race.runners;
  for (const runner of runners) {
    const burst = random() < runner.burst ? 2.2 : 0;
    const fall = random() < (runner.fallRisk || 0) && random() > (runner.resist || 0) ? -1.6 : 0;
    runner.position += runner.speed + burst + fall + runner.late * progress;
  }
  const event = RACE_EVENTS[Math.floor(random() * RACE_EVENTS.length)];
  applyEvent(runners, event, random);
  const lines = runners.map((runner) => buildTrack(runner));
  const hint = {
    神速衝刺: "💥 加速！",
    香蕉皮: "🍌 跌倒！",
    終點爆衝: "🔥 爆衝！",
    雞群混亂: "😵 混亂！"
  }[event] || `🎙️ ${event}`;
  const frame = ["🏁 賽雞開始！", ...lines, hint].join("\n");
  race.raceFrames.push(frame);
  return frame;
}

function rollReward(ticket, playerCount, random = Math.random) {
  const rareShift = (ticket && ticket.betType === "noble" ? 5 : 0) + Math.min(6, Math.max(0, playerCount - 1));
  const weights = {
    gold2000: Math.max(40, 70 - rareShift),
    collectible: 15 + rareShift * 0.2,
    trait: 8 + rareShift * 0.3,
    gold10000: 5 + rareShift * 0.4,
    expansionHeart: 2 + rareShift * 0.05
  };
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [id, weight] of entries) {
    roll -= weight;
    if (roll < 0) return id;
  }
  return "gold2000";
}

function calculateResult(race, random = Math.random) {
  const runners = race.runners || race.selectedChickens.map((chicken) => ({ ...chicken, position: 0 }));
  runners.sort((a, b) => b.position - a.position);
  let winner = runners[0];
  const upset = random() < 0.08;
  if (upset && runners[1]) winner = runners[1];
  const winnerTickets = Object.values(race.playersInMatch).filter((ticket) => ticket.chickenId === winner.id);
  const ticket = winnerTickets.length ? winnerTickets[Math.floor(random() * winnerTickets.length)] : null;
  return {
    winner,
    ticket,
    upset,
    rewardType: rollReward(ticket, Object.keys(race.playersInMatch).length, random)
  };
}

function applyReward(player, result, random = Math.random) {
  if (!result || !result.ticket) return { player, lines: ["本場沒有玩家押中，獎池被雞場收走了。"] };
  const noble = result.ticket.betType === "noble";
  const playerCount = result.playerCount || 1;
  let base = 0;
  let label = "";
  const lines = [];

  if (result.rewardType === "gold2000") {
    base = 2000;
    label = "中獎：2000";
  } else if (result.rewardType === "gold10000") {
    base = 10000;
    label = "中獎：10000";
  } else if (result.rewardType === "trait") {
    player.chickenTraitTickets = (player.chickenTraitTickets || 0) + 1;
    label = "中獎：一次性詞條權";
  } else if (result.rewardType === "expansionHeart") {
    if (player.expansionHeart) {
      base = 3000;
      label = "擴容之心重複：3000";
    } else {
      player.expansionHeart = true;
      label = "中獎：擴容之心（包包永久 +2）";
    }
  } else {
    const pool = CONFIG.collectibles;
    const item = pool[Math.floor(random() * pool.length)];
    player.collection[item.id] = (player.collection[item.id] || 0) + 1;
    label = `中獎：${item.name}`;
  }

  const nobleBonus = base > 0 && noble ? Math.floor(base * 0.05) : 0;
  const multiBonus = base > 0 ? Math.floor(base * Math.min(0.06, Math.max(0, playerCount - 1) * 0.01)) : 0;
  const total = base + nobleBonus + multiBonus;
  if (total > 0) player.gold += total;

  lines.push(label);
  if (nobleBonus > 0) lines.push(`高貴加成：+${nobleBonus}`);
  if (multiBonus > 0) lines.push(`多人加成：+${multiBonus}`);
  if (total > 0) lines.push(`🔥 總獲得：${total} 金幣！`);
  if (result.upset) lines.push("💥 黑馬逆襲！");
  if (noble) lines.push("✨ 高貴勝利！");
  return { player, lines };
}

function buildRaceEmbed(race, message = "") {
  const now = Date.now();
  const remaining = race.status === "betting"
    ? Math.max(0, race.bettingEndsAt - now)
    : race.status === "racing"
      ? Math.max(0, race.racingEndsAt - now)
      : 0;
  const mm = String(Math.floor(remaining / 60000)).padStart(2, "0");
  const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0");
  const chickens = race.selectedChickens.map((chicken) => `${chicken.emoji} ${chicken.name}（${chicken.style}）`).join("\n");
  const tickets = Object.values(race.playersInMatch).map((ticket) => {
    const chicken = getChicken(race, ticket.chickenId);
    return `<@${ticket.userId}>｜${ticket.betType === "noble" ? "✨ 高貴" : "普通"}｜${chicken ? chicken.name : ticket.chickenId}`;
  });
  const frame = race.raceFrames[race.raceFrames.length - 1] || race.selectedChickens.map((chicken) => `${chicken.emoji}${"—".repeat(14)}🏁`).join("\n");
  return new EmbedBuilder()
    .setColor(race.status === "settled" ? 0xfacc15 : 0xf97316)
    .setTitle("賽雞場")
    .setDescription([
      message,
      "",
      "🐔🐓🐔",
      `狀態：${race.status === "betting" ? "下注中" : race.status === "racing" ? "比賽中" : "已結算"}`,
      `人數：${Object.keys(race.playersInMatch).length}`,
      `剩餘：${mm}:${ss}`,
      "",
      "出賽雞：",
      chickens,
      "",
      "票：普通1000｜高貴10000",
      "",
      "賽道：",
      frame,
      "",
      "下注：",
      ...(tickets.length ? tickets : ["尚無下注"])
    ].filter(Boolean).join("\n").slice(0, 4096));
}

function buildRaceComponents(race) {
  if (!race) return [];
  if (race.status === "settled") {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(buildRaceCustomId(race, "next"))
          .setLabel("下一場")
          .setEmoji("🔄")
          .setStyle(ButtonStyle.Success)
      )
    ];
  }
  if (race.status === "racing") return [];
  const rows = [];
  rows.push(new ActionRowBuilder().addComponents(...race.selectedChickens.map((chicken) => (
    new ButtonBuilder()
      .setCustomId(buildRaceCustomId(race, "bet", "normal", chicken.id))
      .setLabel(`普通 ${chicken.name}`)
      .setEmoji(chicken.emoji)
      .setStyle(ButtonStyle.Secondary)
  ))));
  rows.push(new ActionRowBuilder().addComponents(...race.selectedChickens.map((chicken) => (
    new ButtonBuilder()
      .setCustomId(buildRaceCustomId(race, "bet", "noble", chicken.id))
      .setLabel(`高貴 ${chicken.name}`)
      .setEmoji("✨")
      .setStyle(ButtonStyle.Primary)
  ))));
  rows.push(new ActionRowBuilder().addComponents(...race.selectedChickens.map((chicken) => (
    new ButtonBuilder()
      .setCustomId(buildRaceCustomId(race, "roast", chicken.id))
      .setLabel(`烤 ${chicken.name}`)
      .setEmoji("🍗")
      .setStyle(ButtonStyle.Danger)
  ))));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildRaceCustomId(race, "start"))
      .setLabel("提前開始")
      .setEmoji("🏁")
      .setStyle(ButtonStyle.Success)
  ));
  return rows;
}

function beginRace(race, random = Math.random) {
  if (!race || race.status !== "betting") return race;
  if (raceLock.has(race.scopeKey)) return race;
  raceLock.add(race.scopeKey);
  race.status = "racing";
  race.racingEndsAt = Date.now() + RACING_MS;
  race.runners = race.selectedChickens.map((chicken) => ({ ...chicken, position: 0 }));
  updateRaceFrame(race, 0, random);
  return race;
}

function settleRace(race, players, random = Math.random) {
  race.status = "settled";
  raceLock.delete(race.scopeKey);
  for (const userId of Object.keys(race.playersInMatch || {})) {
    if (activeRacePanelByUserId.get(userId) === race.scopeKey) activeRacePanelByUserId.delete(userId);
  }
  const result = calculateResult(race, random);
  result.playerCount = Object.keys(race.playersInMatch).length;
  race.result = result;
  let rewardLines = ["本場沒有玩家押中，獎池被雞場收走了。"];
  if (result.ticket) {
    const applied = applyReward(getPlayer(players[result.ticket.userId]), result, random);
    players[result.ticket.userId] = applied.player;
    rewardLines = applied.lines;
  }
  const champion = result.ticket ? `<@${result.ticket.userId}>` : "無人押中";
  return {
    race,
    players,
    message: [
      `🏆 冠軍：${champion}（${result.winner.emoji} ${result.winner.name}）`,
      "",
      "💰 本場收益：",
      "",
      ...rewardLines
    ].join("\n")
  };
}

function isRaceComponent(customId) {
  return typeof customId === "string" && customId.startsWith(`${RACE_CUSTOM_IDS.prefix}:`);
}

module.exports = {
  BETTING_MS,
  FRAME_COUNT,
  RACE_CUSTOM_IDS,
  RACING_MS,
  applyEvent,
  applyReward,
  beginRace,
  buildRaceComponents,
  buildRaceEmbed,
  buyTicket,
  calculateResult,
  getRaceState,
  isRaceComponent,
  isCurrentRaceComponent,
  parseRaceCustomId,
  roastChicken,
  resetRaceState,
  settleRace,
  startRace,
  updateRaceFrame
};
