"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { getCollectibles, getPlayer } = require("./game");

const SLOT_COUNT = 12;
const COLUMNS = 4;
const SLOT_SIZE = 86;
const GAP = 10;
const PADDING = 16;
const HEADER_HEIGHT = 42;
const WIDTH = PADDING * 2 + COLUMNS * SLOT_SIZE + (COLUMNS - 1) * GAP;
const ROWS = Math.ceil(SLOT_COUNT / COLUMNS);
const GRID_HEIGHT = PADDING * 2 + HEADER_HEIGHT + ROWS * SLOT_SIZE + (ROWS - 1) * GAP;
const HEIGHT = WIDTH;
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

function buildSlot({ index, item, count }) {
  const column = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  const x = PADDING + column * (SLOT_SIZE + GAP);
  const y = PADDING + HEADER_HEIGHT + row * (SLOT_SIZE + GAP);
  const rusty = item && item.type === "rusty";
  const unlocked = item && (rusty || count > 0);
  const label = item ? item.name : "空格";

  const image = unlocked && item.image
    ? `<image href="${imageToDataUri(item.image)}" x="${x + 10}" y="${y + 6}" width="${SLOT_SIZE - 20}" height="${SLOT_SIZE - 24}" preserveAspectRatio="xMidYMid meet"/>`
    : "";

  const rustyIcon = rusty
    ? `<circle cx="${x + SLOT_SIZE / 2}" cy="${y + 36}" r="23" fill="#8b5e34" stroke="#5f3b1f" stroke-width="4"/>
       <circle cx="${x + SLOT_SIZE / 2 - 8}" cy="${y + 29}" r="5" fill="#c08457" opacity="0.65"/>
       <circle cx="${x + SLOT_SIZE / 2 + 9}" cy="${y + 42}" r="4" fill="#4b2e1b" opacity="0.45"/>
       <text x="${x + SLOT_SIZE / 2}" y="${y + 42}" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="800" fill="#f3d19c">?</text>`
    : "";

  const countBadge = unlocked && !rusty
    ? `<rect x="${x + SLOT_SIZE - 31}" y="${y + SLOT_SIZE - 27}" width="24" height="20" rx="8" fill="#111827" opacity="0.92"/>
       <text x="${x + SLOT_SIZE - 19}" y="${y + SLOT_SIZE - 12}" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#fef3c7">x${count}</text>`
    : "";

  const lock = !unlocked
    ? `<text x="${x + SLOT_SIZE / 2}" y="${y + 45}" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#64748b">${item ? "?" : ""}</text>`
    : "";

  return `
    <g>
      <rect x="${x}" y="${y}" width="${SLOT_SIZE}" height="${SLOT_SIZE}" rx="10" fill="${unlocked ? "#f8fafc" : "#dbe3eb"}" stroke="${unlocked ? "#f59e0b" : "#94a3b8"}" stroke-width="3"/>
      <rect x="${x + 5}" y="${y + 5}" width="${SLOT_SIZE - 10}" height="${SLOT_SIZE - 10}" rx="7" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.65"/>
      ${image}
      ${rustyIcon}
      ${lock}
      ${countBadge}
      <text x="${x + SLOT_SIZE / 2}" y="${y + SLOT_SIZE - 8}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="${unlocked ? "#334155" : "#64748b"}">${escapeXml(label.slice(0, 8))}</text>
    </g>
  `;
}

function buildInventorySvg(playerInput) {
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
  const bagSlots = [...collectibleSlots, ...rustySlots].slice(0, SLOT_COUNT);
  const slots = Array.from({ length: SLOT_COUNT }, (_, index) => {
    const slot = bagSlots[index] || null;
    return buildSlot({
      index,
      item: slot ? slot.item : null,
      count: slot ? slot.count : 0
    });
  }).join("\n");

  const total = Object.values(player.collection).reduce((sum, count) => sum + count, 0);
  const used = collectibleSlots.length + player.rusty;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" rx="18" fill="#1f2937"/>
  <rect x="8" y="8" width="${WIDTH - 16}" height="${HEIGHT - 16}" rx="14" fill="#334155" stroke="#64748b" stroke-width="2"/>
  <text x="${PADDING}" y="34" font-family="Arial, sans-serif" font-size="22" font-weight="800" fill="#f8fafc">紀念幣包包</text>
  <text x="${WIDTH - PADDING}" y="33" text-anchor="end" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#fde68a">格數 ${used}/${SLOT_COUNT}</text>
  ${slots}
</svg>`;
}

function buildInventoryPng(playerInput) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "coin-bag-"));
  const svgPath = path.join(tempDir, "coin-bag.svg");
  const pngPath = `${svgPath}.png`;

  try {
    fs.writeFileSync(svgPath, buildInventorySvg(playerInput), "utf8");
    const result = spawnSync("qlmanage", ["-t", "-s", "600", "-o", tempDir, svgPath], {
      encoding: "utf8"
    });

    if (result.status !== 0 || !fs.existsSync(pngPath)) {
      throw new Error(result.stderr || result.stdout || "qlmanage failed to render inventory image");
    }

    return fs.readFileSync(pngPath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function buildSideBagSvg(playerInput) {
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
  const bagSlots = [...collectibleSlots, ...rustySlots].slice(0, SLOT_COUNT);
  const width = 520;
  const height = 520;
  const panelX = 175;
  const panelWidth = 170;
  const slot = 30;
  const gap = 5;
  const x = panelX + 42;
  const startY = 58;

  const slots = Array.from({ length: SLOT_COUNT }, (_, index) => {
    const bagSlot = bagSlots[index] || null;
    const y = startY + index * (slot + gap);
    const rusty = bagSlot && bagSlot.item.type === "rusty";
    const unlocked = Boolean(bagSlot);
    const fill = unlocked ? "#f8fafc" : "#dbe3eb";
    const stroke = unlocked ? "#f59e0b" : "#94a3b8";
    const image = unlocked && bagSlot.item.image
      ? `<image href="${imageToDataUri(bagSlot.item.image)}" x="${x + 5}" y="${y + 3}" width="${slot - 10}" height="${slot - 7}" preserveAspectRatio="xMidYMid meet"/>`
      : "";
    const rustyIcon = rusty
      ? `<circle cx="${x + slot / 2}" cy="${y + 16}" r="11" fill="#8b5e34" stroke="#5f3b1f" stroke-width="3"/>
         <text x="${x + slot / 2}" y="${y + 21}" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="800" fill="#f3d19c">?</text>`
      : "";
    const countBadge = unlocked && !rusty && bagSlot.count > 1
      ? `<text x="${x + slot + 28}" y="${y + 22}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="800" fill="#fde68a">x${bagSlot.count}</text>`
      : "";

    return `
      <g>
        <text x="${x - 8}" y="${y + 20}" text-anchor="end" font-family="Arial, sans-serif" font-size="13" font-weight="800" fill="#cbd5e1">${index + 1}</text>
        <rect x="${x}" y="${y}" width="${slot}" height="${slot}" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="3"/>
        ${image}
        ${rustyIcon}
        ${countBadge}
      </g>
    `;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="16" fill="#1f2937"/>
  <rect x="${panelX}" y="10" width="${panelWidth}" height="${height - 20}" rx="18" fill="#334155" stroke="#64748b" stroke-width="3"/>
  <text x="${width / 2}" y="30" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="900" fill="#f8fafc">包包</text>
  ${slots}
</svg>`;
}

function renderSvgToPng(svg, prefix) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const svgPath = path.join(tempDir, "image.svg");
  const pngPath = `${svgPath}.png`;

  try {
    fs.writeFileSync(svgPath, svg, "utf8");
    const result = spawnSync("qlmanage", ["-t", "-s", "600", "-o", tempDir, svgPath], {
      encoding: "utf8"
    });

    if (result.status !== 0 || !fs.existsSync(pngPath)) {
      throw new Error(result.stderr || result.stdout || "qlmanage failed to render image");
    }

    return fs.readFileSync(pngPath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function buildSideBagPng(playerInput) {
  return renderSvgToPng(buildSideBagSvg(playerInput), "side-bag-");
}

module.exports = {
  buildInventoryPng,
  buildSideBagPng,
  buildInventorySvg
};
