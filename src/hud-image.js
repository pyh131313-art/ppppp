"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  getBagUsedSlots,
  getCollectibles,
  getCollectionTotal,
  getPlayer
} = require("./game");

const WIDTH = 760;
const HEIGHT = 760;
const SLOT_COUNT = 12;
const imageCache = new Map();

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function imageToDataUri(relativePath) {
  if (imageCache.has(relativePath)) return imageCache.get(relativePath);
  const filePath = path.join(__dirname, "..", relativePath);
  const bytes = fs.readFileSync(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
  const uri = `data:${mime};base64,${bytes.toString("base64")}`;
  imageCache.set(relativePath, uri);
  return uri;
}

function getResultEmoji(kind) {
  const map = {
    gold: "🟡",
    rusty: "🟤",
    bomb: "💣",
    dead: "💥",
    full: "🎒",
    empty: "🪨",
    blocked: "☠️"
  };
  return map[kind] || "🪨";
}

function buildMineLines(outcome) {
  if (!outcome) return [
    ["🕳️", "礦道"],
    ["🚶", "待命"],
    ["⛏️", "準備"],
    ["⬛", "尚未挖礦"]
  ];

  return [
    ["🕳️", "礦道"],
    ["🚶", "進入"],
    ["⛏️", "敲擊"],
    [getResultEmoji(outcome.kind), "結果"]
  ];
}

function getBagSlots(playerInput) {
  const player = getPlayer(playerInput);
  const collectibleSlots = getCollectibles()
    .filter((item) => (player.collection[item.id] || 0) > 0)
    .map((item) => ({
      item,
      count: player.collection[item.id] || 0
    }));
  const rustySlots = Array.from({ length: player.rusty }, () => ({
    item: {
      type: "rusty",
      name: "生鏽紀念幣"
    },
    count: 1
  }));

  return [...collectibleSlots, ...rustySlots].slice(0, SLOT_COUNT);
}

function buildBagSlot({ bagSlot, index, x, y }) {
  const slot = 42;
  const rusty = bagSlot && bagSlot.item.type === "rusty";
  const filled = Boolean(bagSlot);
  const fill = filled ? "#f8fafc" : "#dbe3eb";
  const stroke = filled ? "#f59e0b" : "#94a3b8";
  const image = filled && bagSlot.item.image
    ? `<image href="${imageToDataUri(bagSlot.item.image)}" x="${x + 7}" y="${y + 4}" width="28" height="32" preserveAspectRatio="xMidYMid meet"/>`
    : "";
  const rustyIcon = rusty
    ? `<circle cx="${x + 21}" cy="${y + 20}" r="15" fill="#8b5e34" stroke="#5f3b1f" stroke-width="4"/>
       <text x="${x + 21}" y="${y + 26}" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" font-weight="900" fill="#f3d19c">?</text>`
    : "";
  const count = filled && !rusty && bagSlot.count > 1
    ? `<text x="${x + 60}" y="${y + 27}" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="900" fill="#fde68a">x${bagSlot.count}</text>`
    : "";

  return `
    <g>
      <text x="${x - 10}" y="${y + 27}" text-anchor="end" font-family="Arial, sans-serif" font-size="14" font-weight="900" fill="#cbd5e1">${index + 1}</text>
      <rect x="${x}" y="${y}" width="${slot}" height="${slot}" rx="9" fill="${fill}" stroke="${stroke}" stroke-width="3"/>
      ${image}
      ${rustyIcon}
      ${count}
    </g>
  `;
}

function buildHudSvg(playerInput, outcome = null) {
  const player = getPlayer(playerInput);
  const hp = player.dead ? 0 : 2 - player.bombs;
  const used = getBagUsedSlots(player);
  const bagSlots = getBagSlots(player);
  const mineLines = buildMineLines(outcome);
  const title = outcome ? outcome.title : "礦場面板";
  const event = outcome ? outcome.message : "選擇下方按鈕開始挖礦。";

  const mineSvg = mineLines.map(([icon, text], index) => {
    const y = 150 + index * 66;
    return `
      <text x="78" y="${y}" font-family="Apple Color Emoji, Arial, sans-serif" font-size="31">${escapeXml(icon)}</text>
      <text x="126" y="${y - 3}" font-family="Arial, sans-serif" font-size="25" font-weight="900" fill="#f8fafc">${escapeXml(text)}</text>
    `;
  }).join("\n");

  const slotsSvg = Array.from({ length: SLOT_COUNT }, (_, index) => {
    const y = 98 + index * 48;
    return buildBagSlot({ bagSlot: bagSlots[index] || null, index, x: 598, y });
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" rx="22" fill="#111827"/>
  <rect x="14" y="14" width="${WIDTH - 28}" height="${HEIGHT - 28}" rx="18" fill="#24242b" stroke="#3f3f46" stroke-width="2"/>

  <text x="48" y="54" font-family="Arial, sans-serif" font-size="29" font-weight="900" fill="#f8fafc">礦井探險 | ${escapeXml(title)}</text>
  <text x="48" y="86" font-family="Arial, sans-serif" font-size="18" font-weight="800" fill="#d4d4d8">${escapeXml(event.slice(0, 32))}</text>

  <rect x="42" y="104" width="500" height="396" rx="18" fill="#18181b" stroke="#52525b" stroke-width="2"/>
  ${mineSvg}

  <rect x="68" y="420" width="410" height="52" rx="12" fill="#27272a"/>
  <text x="92" y="454" font-family="Arial, sans-serif" font-size="22" font-weight="900" fill="#fde68a">金幣 ${player.gold}</text>
  <text x="228" y="454" font-family="Arial, sans-serif" font-size="22" font-weight="900" fill="#fecaca">生命 ${"♥".repeat(hp)}${".".repeat(2 - hp)} ${hp}/2</text>

  <rect x="562" y="42" width="150" height="650" rx="18" fill="#334155" stroke="#64748b" stroke-width="3"/>
  <text x="637" y="74" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="900" fill="#f8fafc">包包 ${used}/12</text>
  ${slotsSvg}

  <text x="48" y="720" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#a1a1aa">/包包 可看大圖，生鏽紀念幣一枚佔一格。</text>
</svg>`;
}

function renderSvgToPng(svg) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mine-hud-"));
  const svgPath = path.join(tempDir, "hud.svg");
  const pngPath = `${svgPath}.png`;

  try {
    fs.writeFileSync(svgPath, svg, "utf8");
    const result = spawnSync("qlmanage", ["-t", "-s", "900", "-o", tempDir, svgPath], {
      encoding: "utf8"
    });

    if (result.status !== 0 || !fs.existsSync(pngPath)) {
      throw new Error(result.stderr || result.stdout || "qlmanage failed to render HUD");
    }

    return fs.readFileSync(pngPath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function buildHudPng(playerInput, outcome = null) {
  return renderSvgToPng(buildHudSvg(playerInput, outcome));
}

module.exports = {
  buildHudPng,
  buildHudSvg
};
