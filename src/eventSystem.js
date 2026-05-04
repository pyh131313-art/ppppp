"use strict";

const RANDOM_EVENTS = {
  cracked_wall: {
    title: "裂開的礦牆",
    description: "牆縫後面有亮光，但石層很不穩。",
    buttons: { risk: "敲開礦牆", safe: "繞路前進" }
  },
  collapse_warning: {
    title: "坍塌前兆",
    description: "頭頂開始掉碎石，繼續貪可能賺，也可能出事。",
    buttons: { risk: "硬挖一波", safe: "立刻撤退" }
  },
  ancient_rust: {
    title: "古老除鏽機",
    description: "角落有一台舊機器，似乎可以處理生鏽紀念幣。",
    buttons: { risk: "免費除鏽", safe: "穩定除鏽" }
  },
  lost_backpack: {
    title: "遺失的背包",
    description: "地上有一個被丟下的背包，裡面可能有補給，也可能有破爛。",
    buttons: { risk: "翻找背包", safe: "只拿背帶" }
  },
  goblin_purchase: {
    title: "地精收購",
    description: "一個地精說想收購你的礦石，但你看不出牠是好是壞。",
    buttons: { risk: "接受收購", safe: "拒絕收購" }
  },
  cave_roach: {
    title: "超大洞穴蟑螂",
    description: "一隻超大洞穴蟑螂趴在路邊，牠看起來很餓，而且很想被摸頭。",
    buttons: { risk: "摸頭餵食", safe: "慢慢退開" }
  },
  unstable_powder: {
    title: "不穩定火藥堆",
    description: "火藥堆卡在岩縫中，稍微震動就會爆。",
    buttons: { safe: "繞開火藥", risk: "拆出資源", extreme: "點燃衝刺" }
  },
  underground_stream: {
    title: "地下水脈",
    description: "水聲從石壁後方傳來，礦脈似乎被沖開了。",
    buttons: { safe: "沿水繞路", risk: "順水開挖", extreme: "衝進水脈" }
  },
  miner_remains: {
    title: "礦工殘骸",
    description: "你找到一名老礦工留下的背包與工具。",
    buttons: { safe: "整理藥品", risk: "翻找背包", extreme: "背上殘骸包" }
  },
  magnetic_anomaly: {
    title: "異常磁場",
    description: "礦鎬開始發抖，金屬碎片往同一個方向飛。",
    buttons: { safe: "遠離磁場", risk: "追著金光", extreme: "衝進中心" }
  },
  crack_whisper: {
    title: "裂縫低語",
    description: "裂縫裡傳來低語，像是在告訴你下一步。",
    buttons: { safe: "不理會", risk: "聽清低語", extreme: "跳入裂縫" }
  },
  lost_supply_cache: {
    title: "遺失補給箱",
    description: "你在角落發現一只封住的補給箱。",
    buttons: { safe: "拿急救品", risk: "撬開補給箱", extreme: "整箱扛走" }
  },
  explosive_core: {
    title: "爆裂礦核",
    description: "礦核正發出紅光，裡面蘊含高價礦物。",
    buttons: { safe: "標記離開", risk: "小心採集", extreme: "強挖核心" }
  },
  corrosive_gas: {
    title: "腐蝕氣體",
    description: "刺鼻氣體從地縫冒出，越深越濃。",
    buttons: { safe: "立刻回地表", risk: "摀住口鼻", extreme: "硬闖毒霧" }
  },
  goblin_black_market: {
    title: "地精黑市交易",
    description: "戴著黑帽的地精擺出奇怪貨攤。",
    buttons: { safe: "離開", risk: "小額交易", extreme: "豪賭黑市" }
  },
  time_dislocation: {
    title: "時間錯位層",
    description: "礦道像是重複折疊，時間感變得模糊。",
    buttons: { safe: "正常挖", risk: "快進三層", extreme: "重複本層" }
  },
  ancient_curse: {
    title: "古代詛咒",
    description: "你破壞了古代遺跡，詛咒纏上了你的腳步。",
    buttons: { safe: "立刻退開", risk: "承受詛咒", extreme: "破壞遺跡" }
  },
  ancient_blessing: {
    title: "古代祝福",
    description: "你挖到完整的古代遺跡，寶藏仍在發光。",
    buttons: { safe: "領取祝福", risk: "深入搜刮", extreme: "全力搜刮" }
  },
  scrap_recycler: {
    title: "廢品回收商",
    description: "一位回收商願意收購你包包裡的廢品。",
    buttons: { safe: "離開", risk: "出售廢品", extreme: "全部清倉" }
  },
  life_spring: {
    title: "生命之泉",
    description: "清澈泉水從礦壁滲出，散發暖光。",
    buttons: { safe: "喝一口", risk: "裝瓶飲用", extreme: "浸泡療傷" }
  },
  life_altar: {
    title: "生命祭壇",
    description: "祭壇要求你獻上一顆寶石來換取祝福。",
    requiresGem: true,
    buttons: { safe: "離開", risk: "獻上寶石" }
  },
  gambler: {
    title: "賭徒",
    description: "一名賭徒邀請你押上金幣。",
    buttons: { safe: "不賭", risk: "賭金幣" }
  },
  gold_eater: {
    title: "吞金獸",
    description: "吞金獸張開嘴，似乎想吃掉你身上的所有金幣。",
    buttons: { safe: "不餵", risk: "餵食金幣" }
  }
};

function getRandomEvent(eventId) {
  return RANDOM_EVENTS[eventId] || null;
}

function getRandomEvents() {
  return RANDOM_EVENTS;
}

function canEventAppear(event, player) {
  if (!event) return false;
  if (!event.requiresGem) return true;
  return (player.redGem || 0) + (player.blueGem || 0) + (player.greenGem || 0) > 0;
}

function pickRandomEvent(player, random = Math.random) {
  const eventIds = Object.keys(RANDOM_EVENTS).filter((id) => canEventAppear(RANDOM_EVENTS[id], player));
  return eventIds[Math.floor(random() * eventIds.length)] || eventIds[0];
}

function getEventButtonLabels(eventId) {
  const event = getRandomEvent(eventId);
  return event && event.buttons
    ? event.buttons
    : { risk: "冒險選項", safe: "保守選項" };
}

module.exports = {
  RANDOM_EVENTS,
  getEventButtonLabels,
  getRandomEvent,
  getRandomEvents,
  pickRandomEvent
};
