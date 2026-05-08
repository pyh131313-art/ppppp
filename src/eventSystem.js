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
    weight: 0.65,
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
    weight: 0.55,
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
    weight: 0.55,
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
  },
  treasure_chest: {
    title: "礦道寶箱",
    description: "一只寶箱卡在碎石後方，鎖孔裡有微光。",
    weight: 0.65,
    buttons: { safe: "檢查陷阱", risk: "打開寶箱", extreme: "強行砸開" }
  },
  qte_bomb_defuse: {
    title: "💣 炸彈拆除",
    description: "倒數聲貼著耳膜。三條線，只能剪一條。",
    qte: {
      type: "wire",
      seconds: 8,
      choices: [
        { id: "red", label: "紅線" },
        { id: "blue", label: "藍線" },
        { id: "yellow", label: "黃線" }
      ],
      hints: ["⚠️ 鐵絲正在震動…", "火花偏向冷色線。", "炸彈外殼燙得不正常。"]
    }
  },
  qte_cave_escape: {
    title: "🪨 崩塌逃跑",
    description: "頂板裂開。碎石追著你的腳跟落下。",
    qte: {
      type: "escape",
      seconds: 6,
      choices: [
        { id: "left", label: "⬅️" },
        { id: "right", label: "➡️" },
        { id: "up", label: "⬆️" },
        { id: "down", label: "⬇️" }
      ],
      hints: ["風從側邊灌進來。", "腳下石粉往低處滑。", "頭頂碎石先往一側落。"]
    }
  },
  qte_resonance_strike: {
    title: "⚡ 礦脈共振",
    description: "礦脈亮起一瞬。只有一次敲擊機會。",
    qte: {
      type: "timing",
      seconds: 5,
      choices: [
        { id: "early", label: "早敲" },
        { id: "strike", label: "敲擊" },
        { id: "late", label: "晚敲" }
      ],
      hints: ["光點正在靠近中心。", "震動短暫同步。", "下一拍會很亮。"]
    }
  },
  qte_memory_route: {
    title: "🌌 記憶路線",
    description: "牆上閃過四個方向，轉眼就暗下。",
    qte: {
      type: "memory",
      seconds: 10,
      choices: [
        { id: "seq_a", label: "⬅️⬇️➡️⬆️" },
        { id: "seq_b", label: "⬆️➡️⬇️⬅️" },
        { id: "seq_c", label: "➡️⬆️⬅️⬇️" }
      ],
      hints: ["第一步像是往左。", "中段有一次下墜。", "最後的風往上吹。"]
    }
  },
  puzzle_circuit_repair: {
    title: "⚡ 電路修復",
    description: "寶箱電路短路。接錯就會炸。",
    qte: {
      type: "puzzle",
      seconds: 10,
      choices: [
        { id: "line_a", label: "接 A 線" },
        { id: "line_b", label: "接 B 線" },
        { id: "line_c", label: "接 C 線" }
      ],
      hints: ["電流避開焦黑線。", "銅線仍有餘溫。", "綠燈閃得最穩。"]
    }
  },
  puzzle_lava_valve: {
    title: "🌋 岩漿閥門",
    description: "岩漿正在逼近。閥門只能扳一次。",
    qte: {
      type: "puzzle",
      seconds: 9,
      choices: [
        { id: "north", label: "導向北槽" },
        { id: "east", label: "導向東槽" },
        { id: "west", label: "導向西槽" }
      ],
      hints: ["熱氣從東側回流。", "北槽有凝固痕。", "西側石壁比較厚。"]
    }
  },
  lockpick_ancient_vault: {
    title: "🔓 古代金庫",
    description: "鎖芯很老，但還活著。鐵絲撐不了太久。",
    lockpick: { seconds: 12, durability: 3, tolerance: 18, lockType: "ancient" }
  },
  lost_miner: {
    title: "迷路礦工",
    description: "一名礦工迷失在支道裡，背包還掛著半截繩子。",
    buttons: { safe: "指路離開", risk: "護送換報酬", extreme: "借他的工具" }
  },
  broken_lift: {
    title: "破損升降機",
    description: "老舊升降機還能動，但齒輪聲很可疑。",
    buttons: { safe: "檢修齒輪", risk: "花錢搭乘", extreme: "強行超載" }
  },
  glowing_moss: {
    title: "發光苔蘚",
    description: "苔蘚照亮礦道，也遮住了部分礦脈痕跡。",
    buttons: { safe: "採一點照明", risk: "沿著苔蘚走", extreme: "吃下苔蘚" }
  },
  black_vein: {
    title: "黑色礦脈",
    description: "漆黑礦脈像會呼吸，裡面藏著高價礦物。",
    buttons: { safe: "標記離開", risk: "小心採集", extreme: "深挖黑脈" }
  },
  underground_echo: {
    title: "地下回音",
    description: "敲擊聲從左右兩側反彈回來。",
    buttons: { safe: "聽聲辨位", risk: "追著回音", extreme: "敲碎回音壁" }
  },
  blaster_relic: {
    title: "爆破工遺物",
    description: "一只爆破工工具盒躺在碎石堆裡。",
    buttons: { safe: "拿走引線", risk: "打開工具盒", extreme: "試爆裝置" }
  },
  minecart_wreck: {
    title: "礦車殘骸",
    description: "翻倒的礦車卡在軌道上。",
    buttons: { safe: "清出軌道", risk: "翻找車斗", extreme: "推車衝刺" }
  },
  ancient_mark: {
    title: "古代刻印",
    description: "石壁上的刻印閃著微光。",
    buttons: { safe: "拓印符文", risk: "觸碰刻印", extreme: "敲下刻印" }
  },
  deep_airflow: {
    title: "深層氣流",
    description: "一陣冷風從下方灌上來。",
    buttons: { safe: "穩住腳步", risk: "順風下滑", extreme: "跳進風口" }
  },
  rusty_safe: {
    title: "生鏽保險箱",
    description: "保險箱鏽得很嚴重，裡面有東西晃動。",
    buttons: { safe: "撬小縫", risk: "完整打開", extreme: "砸開箱體" }
  },
  cave_vendor: {
    title: "地下商販",
    description: "商販推著小車，接受礦石與寶石交易。",
    buttons: { safe: "換補給", risk: "賣資源", extreme: "買神秘袋" }
  },
  dark_fissure: {
    title: "黑暗縫隙",
    description: "縫隙裡傳來金屬摩擦聲。",
    buttons: { safe: "繞開", risk: "伸手摸索", extreme: "鑽入縫隙" }
  },
  vein_resonance: {
    title: "礦脈共振",
    description: "整片礦壁開始一起震動。",
    buttons: { safe: "降低震動", risk: "順勢開採", extreme: "敲出共振" }
  },
  sudden_cavein: {
    title: "突然塌方",
    description: "後方礦道開始崩落，前方還有一抹金光。",
    buttons: { safe: "帶資源撤退", risk: "冒險繼續", extreme: "衝過塌方" }
  },
  runaway_lamp: {
    title: "失控礦燈",
    description: "礦燈亮得刺眼，陰影裡的東西變得難辨。",
    buttons: { safe: "關掉礦燈", risk: "借光挖礦", extreme: "過載礦燈" }
  },
  route_memory_totem: {
    title: "礦區記憶碑",
    description: "石碑亮起三道刻痕，要求你排出剛才走過的礦區順序。",
    requiresPathHistory: 3,
    memoryReward: "gold",
    buttons: { risk: "選①", safe: "選②", extreme: "選③" }
  },
  echo_survey_map: {
    title: "回音測繪圖",
    description: "測繪圖只記得回音，不記得文字。它要你補回前面的礦區順序。",
    requiresPathHistory: 3,
    memoryReward: "ore",
    buttons: { risk: "選①", safe: "選②", extreme: "選③" }
  },
  old_miner_password: {
    title: "老礦工暗號",
    description: "一道舊鐵門要求你說出前幾段礦區的名字，順序錯了就會觸發機關。",
    requiresPathHistory: 4,
    memoryReward: "buff",
    buttons: { risk: "選①", safe: "選②", extreme: "選③" }
  },
  wild_mine_chicken: {
    title: "野生賽雞",
    description: "🐓 你聽見礦道深處傳來奇怪的雞叫聲…",
    weight: 0.9,
    buttons: { safe: "放過", risk: "短跑挑戰", extreme: "餵食互動" }
  },
  mine_collapse_evacuation: {
    title: "礦坑大崩塌",
    description: "⚠️ 礦坑開始劇烈震動，支撐木樑一根接一根斷裂。",
    weight: 0.12,
    minDepth: 45,
    forceEvacuation: true,
    buttons: { safe: "抓緊撤離", risk: "搶救資源", extreme: "硬撐到底" }
  },
  spatial_turbulence_evacuation: {
    title: "空間亂流",
    description: "🌀 礦道突然反折，入口和出口像被揉在一起。",
    weight: 0.08,
    minDepth: 70,
    forceEvacuation: true,
    buttons: { safe: "順流撤退", risk: "抓住礦袋", extreme: "逆流衝刺" }
  },
  sky_rift_evacuation: {
    title: "天域裂縫",
    description: "⚡ 頭頂裂開白色縫隙，整條路線被往上拉扯。",
    weight: 0.06,
    minDepth: 90,
    forceEvacuation: true,
    buttons: { safe: "穩住身體", risk: "伸手撈光", extreme: "跳進裂縫" }
  },
  deep_pollution_evacuation: {
    title: "深層污染爆發",
    description: "💀 黑色粉塵從礦壁滲出，空氣像被污染的水一樣沉重。",
    weight: 0.08,
    minDepth: 80,
    forceEvacuation: true,
    buttons: { safe: "立刻脫離", risk: "封住礦脈", extreme: "硬吸一口" }
  }
};

const GEM_EVENTS = Object.fromEntries([
  ["ruby_resonance", "紅寶石共鳴"],
  ["sapphire_spring", "藍寶石冷泉"],
  ["emerald_vines", "綠寶石藤蔓"],
  ["crystal_refraction", "水晶折射"],
  ["gem_swarm", "寶石蟲群"],
  ["stalactite_rain", "鐘乳石雨"],
  ["platinum_trash_heap", "白金垃圾堆"],
  ["shining_crack", "閃耀裂縫"],
  ["gem_altar", "寶石祭壇"],
  ["broken_crystal_heart", "破碎晶心"],
  ["gem_merchant", "寶石商人"],
  ["unbalanced_lamp", "失衡礦燈"],
  ["crystalized_wound", "晶化傷口"],
  ["crystal_maze", "水晶迷宮"],
  ["gem_illusion", "寶石幻象"],
  ["underground_light_tide", "地底光潮"],
  ["gem_collapse", "寶石塌陷"],
  ["rainbow_node", "彩虹礦點"],
  ["light_eating_bat", "噬光蝙蝠"],
  ["crystal_core_awake", "晶核覺醒"]
].map(([id, title]) => [id, {
  title,
  description: "寶石洞窟的光線變得不穩定，危險與收穫一起靠近。",
  caveType: "gem",
  buttons: { safe: "保守處理", risk: "冒險採集", extreme: "強行引爆" }
}]));

const HIGH_EVENTS = Object.fromEntries([
  ["high_contract", "高額契約"],
  ["soul_investment", "靈魂投資"],
  ["deep_invitation", "深層邀請函"],
  ["fate_auction", "命運拍賣"],
  ["golden_judgement", "黃金審判"],
  ["reversal_gate", "逆轉之門"],
  ["rich_curse", "富豪詛咒"],
  ["black_gold_altar", "黑金祭壇"],
  ["high_goblin", "高位地精"],
  ["balance_vein", "天秤礦脈"],
  ["contract_bag", "契約背包"],
  ["coin_rain", "金幣雨"],
  ["fate_coin", "命運硬幣"],
  ["abyss_insurance", "深淵保險"],
  ["treasure_mirage", "財寶幻境"],
  ["advanced_rust_machine", "高階除鏽機"],
  ["ancient_stock_market", "遠古股市"],
  ["greed_throne", "貪婪王座"],
  ["gold_vein_awake", "金脈覺醒"],
  ["astral_invitation", "星界邀約"]
].map(([id, title]) => [id, {
  title,
  description: "只有帶著大量資產下礦的人，才會被這種危險邀請盯上。",
  highTier: true,
  buttons: { safe: "保守離開", risk: "簽下契約", extreme: "押上更多" }
}]));

const REVERSE_EVENTS = {
  reverse_gravity_vein: {
    title: "反重力礦脈",
    description: "礦脈往天空流動，碎石像雨一樣向上掉。",
    reverseOnly: true,
    buttons: { safe: "慢慢採集", risk: "追著礦脈", extreme: "跳進反重力流" }
  },
  sky_light_crack: {
    title: "天光裂縫",
    description: "裂縫另一端透出刺眼天光。",
    reverseOnly: true,
    buttons: { safe: "觀察裂縫", risk: "伸手採光", extreme: "鑽進裂縫" }
  },
  inverted_merchant: {
    title: "倒置商人",
    description: "倒掛的商人收購顛倒礦石。",
    reverseOnly: true,
    buttons: { safe: "離開", risk: "詢問兌換", extreme: "交易顛倒礦石" }
  },
  broken_sky_stone: {
    title: "破碎天空石",
    description: "天空石碎片浮在礦道中央。",
    reverseOnly: true,
    buttons: { safe: "撿小碎片", risk: "敲下核心", extreme: "背起天空石" }
  },
  rising_turbulence: {
    title: "上升亂流",
    description: "亂流把礦塵往上捲，像看不見的升降梯。",
    reverseOnly: true,
    buttons: { safe: "穩住", risk: "乘風上升", extreme: "衝進亂流" }
  },
  mirror_lake: {
    title: "鏡面地下湖",
    description: "湖面倒映著背包裡的反轉資源。",
    reverseOnly: true,
    buttons: { safe: "輕碰湖面", risk: "投入資源", extreme: "跳進倒影" }
  },
  upside_down_shrine: {
    title: "倒懸神龕",
    description: "神龕倒掛在天花板，像在等你獻上什麼。",
    reverseOnly: true,
    buttons: { safe: "祈禱", risk: "獻上寶石", extreme: "拆下神龕" }
  },
  skyfall_debris: {
    title: "墜天碎片",
    description: "像天空掉下來的金屬碎片卡在岩壁裡。",
    reverseOnly: true,
    buttons: { safe: "撿碎屑", risk: "撬開碎片", extreme: "整塊拔出" }
  },
  echo_elevator: {
    title: "回音升降梯",
    description: "空井裡傳來上方的回音，像有人在拉動纜繩。",
    reverseOnly: true,
    buttons: { safe: "聽聲定位", risk: "抓住纜繩", extreme: "跳進空井" }
  },
  void_pocket: {
    title: "虛空口袋",
    description: "一個黑色口袋漂在半空，裡面比外面還大。",
    reverseOnly: true,
    buttons: { safe: "摸邊緣", risk: "塞進背包", extreme: "整個背上" }
  }
};

Object.assign(RANDOM_EVENTS, GEM_EVENTS, HIGH_EVENTS, REVERSE_EVENTS);

function getRandomEvent(eventId) {
  return RANDOM_EVENTS[eventId] || null;
}

function getRandomEvents() {
  return RANDOM_EVENTS;
}

function canEventAppear(event, player) {
  if (!event) return false;
  if (event === RANDOM_EVENTS.gold_eater) {
    const totalAsset = Math.max(0, (player.gold || 0) + (player.bankGold || 0));
    if (totalAsset > 50000 || player.hasSeenGoldenBeast) return false;
  }
  if (event.caveType && player.caveType !== event.caveType) return false;
  if (event.reverseOnly && player.zone !== "upward") return false;
  if (event.highTier && !player.highTierEligible) return false;
  if (event.minDepth && Math.abs(player.depth || 0) < event.minDepth) return false;
  if (event.forceEvacuation && !["mine", "upward", "skyDown"].includes(player.zone)) return false;
  if (event.requiresPathHistory && (!Array.isArray(player.digPathHistory) || player.digPathHistory.length < event.requiresPathHistory)) return false;
  if (!event.caveType && !event.reverseOnly && !event.highTier && player.caveType === "gem") return false;
  if (!event.caveType && !event.reverseOnly && !event.highTier && player.zone === "upward") return false;
  if (!event.requiresGem) return true;
  return (player.redGem || 0) + (player.blueGem || 0) + (player.greenGem || 0) > 0;
}

function pickRandomEvent(player, random = Math.random, filter = null) {
  const eventIds = Object.keys(RANDOM_EVENTS).filter((id) => {
    if (filter && !filter(id, RANDOM_EVENTS[id])) return false;
    return canEventAppear(RANDOM_EVENTS[id], player);
  });
  const weighted = eventIds.map((id) => ({ id, weight: Math.max(0, RANDOM_EVENTS[id].weight == null ? 1 : RANDOM_EVENTS[id].weight) }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return eventIds[Math.floor(random() * eventIds.length)] || eventIds[0];
  let roll = random() * totalWeight;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) return item.id;
  }
  return weighted[weighted.length - 1] ? weighted[weighted.length - 1].id : eventIds[0];
}

function pickGemEvent(player, random = Math.random) {
  return pickRandomEvent(player, random, (id, event) => Boolean(event.caveType === "gem"));
}

function pickHighTierEvent(player, random = Math.random) {
  return pickRandomEvent(player, random, (id, event) => Boolean(event.highTier));
}

function pickReverseEvent(player, random = Math.random) {
  return pickRandomEvent(player, random, (id, event) => Boolean(event.reverseOnly));
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
  pickGemEvent,
  pickHighTierEvent,
  pickReverseEvent,
  pickRandomEvent
};
