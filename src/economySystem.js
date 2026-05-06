"use strict";

const { CONFIG } = require("./config");
const { getPlayer } = require("./playerState");

function getTotalAsset(playerInput) {
  const player = getPlayer(playerInput);
  return Math.max(0, (player.gold || 0) + (player.bankGold || 0));
}

function payFromTotalAsset(player, amount) {
  const cost = Math.max(0, Math.floor(amount));
  const fromGold = Math.min(player.gold, cost);
  player.gold -= fromGold;
  const rest = cost - fromGold;
  player.bankGold = Math.max(0, player.bankGold - rest);
  return cost;
}

function getElevatorCost(playerInput) {
  return Math.floor(getTotalAsset(playerInput) * 0.1);
}

function canUseBank(playerInput, isInMine) {
  const player = getPlayer(playerInput);
  return !isInMine(player) || player.zone === "undergroundCamp";
}

function formatBankMessage(playerInput, actionMessage = "") {
  const player = getPlayer(playerInput);
  const title = player.zone === "undergroundCamp" ? "【地底營地】" : "【銀行】";
  const lines = [
    title,
    "",
    "🏦 銀行",
    `目前餘額：${player.bankGold}`,
    `身上金幣：${player.gold}`,
    `總資產：${getTotalAsset(player)}`
  ];
  if (actionMessage) lines.unshift(actionMessage, "");
  return lines.join("\n");
}

function resolveBankAmount(inputAmount, available) {
  const amount = Number(inputAmount);
  if (!Number.isFinite(amount)) return available;
  if (!Number.isInteger(amount)) return Math.floor(amount);
  if (amount <= 0) return available;
  if (amount > available) return available;
  return amount;
}

function depositBank(playerInput, isInMine, amount = null) {
  const player = getPlayer(playerInput);
  const requestedAmount = resolveBankAmount(amount, player.gold);

  if (!canUseBank(player, isInMine)) {
    return {
      ok: false,
      player,
      message: "銀行只能在地表或地底營地使用。"
    };
  }

  if (player.gold <= 0) {
    return {
      ok: false,
      player,
      message: formatBankMessage(player, "身上沒有金幣可以存入銀行。")
    };
  }

  const depositedAmount = requestedAmount;
  player.gold -= depositedAmount;
  player.bankGold += depositedAmount;
  const requestedText = Number.isFinite(Number(amount))
    ? Number(amount) > 0 && depositedAmount < player.gold + depositedAmount
      ? `（超過可存入範圍，已改為存入 ${depositedAmount}）`
      : ""
    : "";

  return {
    ok: true,
    player,
    message: formatBankMessage(player, `已存入 ${depositedAmount} 金幣${requestedText}。銀行金幣死亡不會噴。`)
  };
}

function withdrawBank(playerInput, isInMine, amount = null) {
  const player = getPlayer(playerInput);

  if (!canUseBank(player, isInMine)) {
    return {
      ok: false,
      player,
      message: "銀行只能在地表或地底營地使用。"
    };
  }

  if (player.bankGold <= 0) {
    return {
      ok: false,
      player,
      message: formatBankMessage(player, "銀行目前沒有金幣可以領出。")
    };
  }

  const requestedAmount = resolveBankAmount(amount, player.bankGold);
  player.bankGold -= requestedAmount;
  player.gold += requestedAmount;
  const requestedText = Number.isFinite(Number(amount))
    ? Number(amount) > 0 && requestedAmount < player.bankGold + requestedAmount
      ? `（超過可領取範圍，已改為領取 ${requestedAmount}）`
      : ""
    : "";

  return {
    ok: true,
    player,
    message: formatBankMessage(player, `已領出 ${requestedAmount} 金幣${requestedText}。領出後如果死亡，身上金幣會照常損失。`)
  };
}

function travelToUndergroundCamp(playerInput, isInMine, now = Date.now()) {
  const player = getPlayer(playerInput);
  if (!player.undergroundCampUnlocked) {
    return { ok: false, player, message: "你尚未解鎖地底營地。" };
  }
  if (isInMine(player)) {
    return { ok: false, player, message: "只有在地表可以搭電梯前往地底營地。" };
  }
  const cost = getElevatorCost(player);
  if (cost <= 0) return { ok: false, player, message: "付費電梯偵測不到資產，暫時無法啟動。" };
  payFromTotalAsset(player, cost);
  player.zone = "undergroundCamp";
  player.depth = CONFIG.mining.lavaDepth;
  player.runDepthProgress = 0;
  player.lastElevatorAt = now;
  return { ok: true, player, message: `已支付 ${cost} 金幣搭乘電梯抵達地底營地。` };
}

function openUndergroundInn(playerInput) {
  const player = getPlayer(playerInput);
  if (player.zone !== "undergroundCamp") {
    return { ok: false, player, message: "地底客棧只能在地底營地使用。" };
  }
  return {
    ok: true,
    player,
    message: "【地底客棧】\n顛倒礦石與顛倒寶石的兌換功能即將開放。\n敬請期待。"
  };
}

module.exports = {
  canUseBank,
  depositBank,
  formatBankMessage,
  getElevatorCost,
  getTotalAsset,
  openUndergroundInn,
  payFromTotalAsset,
  travelToUndergroundCamp,
  withdrawBank
};
