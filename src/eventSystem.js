"use strict";

const EVENT_TYPE_KEYS = [
  "qte",
  "puzzle",
  "lockpick",
  "wildChicken",
  "race",
  "chest",
  "highTier",
  "special",
  "underground",
  "sky"
];

function createEventTypeMissCounter(source = {}) {
  return Object.fromEntries(EVENT_TYPE_KEYS.map((key) => [
    key,
    Math.max(0, Math.floor(source && source[key] || 0))
  ]));
}

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
  trait_swap_merchant: {
    title: "神秘詞條商人",
    description: "披斗篷的商人攤開兩張發光契約，像是在招攬你改變挖法。",
    weight: 0.45,
    traitSwapEvent: true,
    mutation: "fusion",
    buttons: { safe: "拒絕交易", risk: "交換詞條", extreme: "融合詞條" }
  },
  trait_swap_deep_mirror: {
    title: "深層鏡像",
    description: "鏡面裡的你拿著另一種工具，笑得有點不自然。",
    weight: 0.32,
    minDepth: 55,
    traitSwapEvent: true,
    mutation: "polluted",
    buttons: { safe: "打碎鏡像", risk: "接受替換", extreme: "污染詞條" }
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
  qte_lava_jump: {
    title: "🌋 岩漿跳躍",
    description: "腳下石板一片片沉進岩漿，只剩幾個落點。",
    reverseOnly: true,
    qte: {
      type: "underground",
      seconds: 5,
      choices: [
        { id: "black", label: "黑岩" },
        { id: "red", label: "紅岩" },
        { id: "steam", label: "蒸氣石" }
      ],
      hints: ["紅岩邊緣正在融化。", "黑岩還有裂縫但沒發亮。", "蒸氣石底下是空的。"]
    }
  },
  qte_inverted_keys: {
    title: "🌀 顛倒按鍵",
    description: "左右方向突然反過來，石門正在快速關閉。",
    reverseOnly: true,
    qte: {
      type: "underground",
      seconds: 4,
      choices: [
        { id: "left", label: "按左" },
        { id: "right", label: "按右" },
        { id: "center", label: "按中" }
      ],
      hints: ["牆上的箭頭是倒影。", "你看到的左邊其實在右邊。"]
    }
  },
  qte_chain_release: {
    title: "⛓️ 地底鎖鏈",
    description: "鎖鏈纏住礦袋，拉錯會把你拖回深處。",
    reverseOnly: true,
    qte: {
      type: "underground",
      seconds: 6,
      choices: [
        { id: "pull", label: "拉主鏈" },
        { id: "cut", label: "敲扣環" },
        { id: "loosen", label: "鬆副鏈" }
      ],
      hints: ["主鏈太緊。", "扣環上有新裂痕。", "副鏈沒有承重。"]
    }
  },
  qte_deep_suffocation: {
    title: "💀 深層窒息",
    description: "空氣突然變薄，視線開始發黑。",
    reverseOnly: true,
    qte: {
      type: "underground",
      seconds: 5,
      choices: [
        { id: "vent", label: "找風口" },
        { id: "cloth", label: "摀布" },
        { id: "run", label: "衝刺" }
      ],
      hints: ["有一股很冷的風。", "粉塵不是最大問題。", "亂跑會更喘。"]
    }
  },
  qte_wind_balance: {
    title: "🌪️ 強風平衡",
    description: "天空礦道被強風吹歪，腳下只剩浮石。",
    skyOnly: true,
    qte: {
      type: "sky",
      seconds: 4,
      choices: [
        { id: "lean_left", label: "左傾" },
        { id: "lean_right", label: "右傾" },
        { id: "crouch", label: "壓低" }
      ],
      hints: ["風從右側切過來。", "浮石中央最穩。", "抬頭會被吹翻。"]
    }
  },
  qte_lightning_dodge: {
    title: "⚡ 雷電閃避",
    description: "白雷在雲層裡跳動，下一秒就會劈下。",
    skyOnly: true,
    qte: {
      type: "sky",
      seconds: 4,
      choices: [
        { id: "cloud", label: "躲雲影" },
        { id: "spire", label: "靠尖塔" },
        { id: "open", label: "站空地" }
      ],
      hints: ["尖塔正在導電。", "雲影短暫變暗。", "空地太亮了。"]
    }
  },
  qte_cloud_bridge: {
    title: "☁️ 雲橋跳躍",
    description: "三段雲橋閃一下就消失，你得記住安全落點。",
    skyOnly: true,
    qte: {
      type: "sky",
      seconds: 6,
      choices: [
        { id: "soft_hard_soft", label: "軟硬軟" },
        { id: "hard_soft_hard", label: "硬軟硬" },
        { id: "soft_soft_hard", label: "軟軟硬" }
      ],
      hints: ["中間那塊雲最亮。", "第一步別踩太重。"]
    }
  },
  qte_lightwing_resonance: {
    title: "✨ 光翼共鳴",
    description: "透明光翼貼到你的背上，節拍只亮一瞬。",
    skyOnly: true,
    qte: {
      type: "sky",
      seconds: 5,
      choices: [
        { id: "early", label: "早拍" },
        { id: "sync", label: "同步" },
        { id: "late", label: "晚拍" }
      ],
      hints: ["光點快碰到中心。", "下一次脈動最完整。"]
    }
  },
  lockpick_lava_lock: {
    title: "🌋 熔岩鎖",
    description: "鎖芯像燒紅的岩漿，停太久鐵絲會軟掉。",
    reverseOnly: true,
    lockpick: { seconds: 8, durability: 2, tolerance: 16 }
  },
  lockpick_inverted_lock: {
    title: "🌀 顛倒鎖",
    description: "鎖孔倒映著你的手，左右轉動感完全相反。",
    reverseOnly: true,
    lockpick: { seconds: 10, durability: 3, tolerance: 14 }
  },
  lockpick_pollution_lock: {
    title: "💀 污染鎖",
    description: "黑粉黏住鎖孔，每一次失誤都會腐蝕鐵絲。",
    reverseOnly: true,
    lockpick: { seconds: 9, durability: 2, tolerance: 18 }
  },
  lockpick_thunder_lock: {
    title: "⚡ 雷電鎖",
    description: "電弧沿著鎖芯亂跳，角度感一直被干擾。",
    skyOnly: true,
    lockpick: { seconds: 8, durability: 3, tolerance: 15 }
  },
  lockpick_astral_lock: {
    title: "✨ 星界鎖",
    description: "鎖孔像星圖一樣旋轉，正確區域忽遠忽近。",
    skyOnly: true,
    lockpick: { seconds: 11, durability: 3, tolerance: 12 }
  },
  lockpick_sky_seal: {
    title: "☁️ 天域封印",
    description: "雲紋封印需要連續穩住，錯一次就會散開。",
    skyOnly: true,
    lockpick: { seconds: 12, durability: 4, tolerance: 10 }
  },
  puzzle_lava_pipe: {
    title: "🌋 熔岩管線",
    description: "熔岩在管線裡翻湧，導錯方向就會噴出來。",
    reverseOnly: true,
    qte: {
      type: "puzzle",
      seconds: 8,
      choices: [
        { id: "valve_a", label: "轉 A 閥" },
        { id: "valve_b", label: "轉 B 閥" },
        { id: "valve_c", label: "轉 C 閥" }
      ],
      hints: ["B 閥有新鮮灼痕。", "A 閥下方已經凝固。", "C 閥傳出空響。"]
    }
  },
  puzzle_inverted_path: {
    title: "🌀 顛倒路徑",
    description: "路線圖上下反轉，真正的出口藏在倒影裡。",
    reverseOnly: true,
    qte: {
      type: "puzzle",
      seconds: 9,
      choices: [
        { id: "mirror_top", label: "選倒影上路" },
        { id: "mirror_mid", label: "選倒影中路" },
        { id: "mirror_low", label: "選倒影下路" }
      ],
      hints: ["現實的下方對應倒影出口。", "中路一直重複。"]
    }
  },
  puzzle_underground_seal: {
    title: "⛓️ 地底封印",
    description: "三枚封印輪流發亮，壓力越來越重。",
    reverseOnly: true,
    qte: {
      type: "puzzle",
      seconds: 8,
      choices: [
        { id: "iron", label: "鐵印" },
        { id: "bone", label: "骨印" },
        { id: "ash", label: "灰印" }
      ],
      hints: ["灰印沒有影子。", "骨印亮得太慢。", "鐵印震動最穩。"]
    }
  },
  puzzle_light_refraction: {
    title: "☀️ 光線折射",
    description: "天光穿過浮晶，只有一個角度能打開路。",
    skyOnly: true,
    qte: {
      type: "puzzle",
      seconds: 7,
      choices: [
        { id: "prism_left", label: "左稜鏡" },
        { id: "prism_mid", label: "中稜鏡" },
        { id: "prism_right", label: "右稜鏡" }
      ],
      hints: ["中稜鏡的影子最短。", "右側光線太散。"]
    }
  },
  puzzle_floating_bridge: {
    title: "☁️ 浮空橋",
    description: "橋板漂在雲上，重量分配錯就會翻面。",
    skyOnly: true,
    qte: {
      type: "puzzle",
      seconds: 8,
      choices: [
        { id: "feather", label: "羽紋板" },
        { id: "stone", label: "石紋板" },
        { id: "glass", label: "玻璃板" }
      ],
      hints: ["玻璃板裡沒有倒影。", "羽紋板跟風同向。"]
    }
  },
  puzzle_sky_circuit: {
    title: "⚡ 天域電路",
    description: "雲端電路閃爍，接錯會引來白雷。",
    skyOnly: true,
    qte: {
      type: "puzzle",
      seconds: 7,
      choices: [
        { id: "silver", label: "接銀線" },
        { id: "gold", label: "接金線" },
        { id: "blue", label: "接藍線" }
      ],
      hints: ["藍線沒有焦痕。", "金線正在發燙。", "銀線閃得太快。"]
    }
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
    weight: 0.45,
    buttons: { safe: "放過", risk: "短跑挑戰", extreme: "餵食互動" }
  },
  mine_collapse_evacuation: {
    title: "礦坑大崩塌",
    description: "⚠️ 礦坑開始劇烈震動，支撐木樑一根接一根斷裂。",
    weight: 0.12,
    minDepth: 45,
    forceEvacuation: true,
    qte: {
      type: "evacuation",
      seconds: 6,
      choices: [
        { id: "brace", label: "抓岩釘" },
        { id: "dash", label: "衝過去" },
        { id: "crawl", label: "貼地爬" }
      ],
      hints: ["碎石先從右側落下。", "岩釘還沒完全鬆。", "低處有一小段空隙。"]
    },
    buttons: { safe: "抓緊撤離", risk: "搶救資源", extreme: "硬撐到底" }
  },
  spatial_turbulence_evacuation: {
    title: "空間亂流",
    description: "🌀 礦道突然反折，入口和出口像被揉在一起。",
    weight: 0.08,
    minDepth: 70,
    forceEvacuation: true,
    qte: {
      type: "evacuation",
      seconds: 5,
      choices: [
        { id: "anchor", label: "抓住礦車" },
        { id: "step", label: "踩穩石階" },
        { id: "jump", label: "跳過裂口" }
      ],
      hints: ["亂流正在往低處捲。", "礦車軌道還連著地面。", "裂口邊緣忽明忽暗。"]
    },
    buttons: { safe: "順流撤退", risk: "抓住礦袋", extreme: "逆流衝刺" }
  },
  sky_rift_evacuation: {
    title: "天域裂縫",
    description: "⚡ 頭頂裂開白色縫隙，整條路線被往上拉扯。",
    weight: 0.06,
    minDepth: 90,
    forceEvacuation: true,
    qte: {
      type: "evacuation",
      seconds: 5,
      choices: [
        { id: "chain", label: "抓住鎖鏈" },
        { id: "shadow", label: "躲進陰影" },
        { id: "stone", label: "抱緊石柱" }
      ],
      hints: ["白光避開陰影。", "石柱表面正在剝落。", "鎖鏈發出很細的聲音。"]
    },
    buttons: { safe: "穩住身體", risk: "伸手撈光", extreme: "跳進裂縫" }
  },
  deep_pollution_evacuation: {
    title: "深層污染爆發",
    description: "💀 黑色粉塵從礦壁滲出，空氣像被污染的水一樣沉重。",
    weight: 0.08,
    minDepth: 80,
    forceEvacuation: true,
    qte: {
      type: "evacuation",
      seconds: 7,
      choices: [
        { id: "mask", label: "摀住口鼻" },
        { id: "vent", label: "衝向風口" },
        { id: "seal", label: "封住裂縫" }
      ],
      hints: ["風口有乾淨空氣。", "黑粉從裂縫噴出。", "先別深呼吸。"]
    },
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
  },
  trait_swap_inverted_stele: {
    title: "顛倒石碑",
    description: "石碑把你的詞條倒著念出來，並浮出另一條路。",
    reverseOnly: true,
    traitSwapEvent: true,
    mutation: "inverted",
    buttons: { safe: "不碰石碑", risk: "交換詞條", extreme: "顛倒變異" }
  },
  underground_lava_chicken: {
    title: "🌋 熔岩爆衝雞",
    description: "地底賽雞踏著熱風衝出岩縫，尾羽冒著火星。",
    reverseOnly: true,
    buttons: { safe: "放牠衝過", risk: "短跑挑戰", extreme: "餵食挑釁" }
  },
  underground_pollution_chicken: {
    title: "💀 污染失控雞",
    description: "牠的腳步忽快忽慢，像被深層污染推著跑。",
    reverseOnly: true,
    buttons: { safe: "保持距離", risk: "短跑挑戰", extreme: "餵食互動" }
  },
  underground_inverted_chicken: {
    title: "🌀 顛倒衝刺雞",
    description: "牠倒著跑，卻比正常跑還快。",
    reverseOnly: true,
    buttons: { safe: "看牠離開", risk: "短跑挑戰", extreme: "餵食互動" }
  }
};

const SKY_EVENTS = {
  trait_swap_sky_messenger: {
    title: "天域使者",
    description: "發光的人影遞出一枚羽狀契約，要你把現在的詞條交出去。",
    skyOnly: true,
    traitSwapEvent: true,
    mutation: "astral",
    buttons: { safe: "收回手", risk: "交換詞條", extreme: "星光變異" }
  },
  sky_thunder_chicken: {
    title: "⚡ 雷鳴加速雞",
    description: "一隻賽雞踏著雷光滑過雲道。",
    skyOnly: true,
    buttons: { safe: "讓牠通過", risk: "短跑挑戰", extreme: "餵食引雷" }
  },
  sky_cloud_glider_chicken: {
    title: "☁️ 雲層滑翔雞",
    description: "牠張開羽毛滑過雲橋，速度不快但路線很漂亮。",
    skyOnly: true,
    buttons: { safe: "揮手道別", risk: "短跑挑戰", extreme: "餵食互動" }
  },
  sky_starlight_reversal_chicken: {
    title: "✨ 星光逆轉雞",
    description: "牠落後時身上星光反而更亮。",
    skyOnly: true,
    buttons: { safe: "觀察星光", risk: "短跑挑戰", extreme: "餵食互動" }
  },
  sky_sun_mirror: {
    title: "☀️ 日輪鏡面",
    description: "太陽鏡浮在雲層間，照出背包裡真正發光的東西。",
    skyOnly: true,
    buttons: { safe: "遮光觀察", risk: "折射光線", extreme: "直視核心" }
  },
  sky_cloud_fisher: {
    title: "🎣 雲海釣客",
    description: "有人坐在雲邊釣魚，魚線垂進看不見的天空深處。",
    skyOnly: true,
    buttons: { safe: "借看魚簍", risk: "幫忙拉線", extreme: "跳上雲竿" }
  },
  sky_star_anvil: {
    title: "⭐ 星屑鐵砧",
    description: "鐵砧敲一下就會濺出星屑，但雲橋也會跟著發裂。",
    skyOnly: true,
    buttons: { safe: "撿星屑", risk: "敲一次", extreme: "連敲三下" }
  },
  sky_wind_hole: {
    title: "🌬️ 風眼空洞",
    description: "雲洞中央沒有風，邊緣卻像刀一樣旋轉。",
    skyOnly: true,
    buttons: { safe: "貼邊繞過", risk: "穿過風眼", extreme: "借風俯衝" }
  },
  sky_moon_moth: {
    title: "🦋 月光蛾群",
    description: "月光蛾圍著礦燈飛，翅粉落在礦袋上。",
    skyOnly: true,
    buttons: { safe: "熄燈等待", risk: "收集翅粉", extreme: "追進蛾群" }
  },
  sky_rainbow_bridge: {
    title: "🌈 彩虹斷橋",
    description: "彩虹橋缺了幾段，橋下是倒著流的天空。",
    skyOnly: true,
    buttons: { safe: "試探橋面", risk: "跨過裂口", extreme: "衝刺過橋" }
  },
  sky_oracle_bird: {
    title: "🪽 預言鳥",
    description: "白鳥啄出三顆雲石，像是在替下一鏟占卜。",
    skyOnly: true,
    buttons: { safe: "聽牠叫聲", risk: "拿走雲石", extreme: "改寫預言" }
  },
  sky_falling_market: {
    title: "🛒 墜落市集",
    description: "幾個攤位正在往下掉，商品和招牌一起旋轉。",
    skyOnly: true,
    buttons: { safe: "撿掉落物", risk: "搶購商品", extreme: "接住攤車" }
  },
  sky_bell_tower: {
    title: "🔔 空鐘塔",
    description: "鐘聲從沒有鐘的塔裡傳出，每響一次雲層就換位。",
    skyOnly: true,
    buttons: { safe: "數鐘聲", risk: "敲回去", extreme: "爬上鐘塔" }
  },
  sky_light_vine: {
    title: "🌿 光藤",
    description: "發光藤蔓從雲底垂下，纏著幾塊亮晶晶的碎片。",
    skyOnly: true,
    buttons: { safe: "剪小段", risk: "拉下藤蔓", extreme: "順藤滑下" }
  },
  sky_meteor_splinter: {
    title: "☄️ 流星裂片",
    description: "剛冷卻的流星裂片卡在雲岩裡，還在冒白煙。",
    skyOnly: true,
    buttons: { safe: "撿外殼", risk: "撬裂片", extreme: "抱住核心" }
  },
  sky_silent_choir: {
    title: "🎼 無聲合唱",
    description: "看不見的合唱團張口唱歌，你的能量條跟著震動。",
    skyOnly: true,
    buttons: { safe: "閉眼聽", risk: "跟著哼", extreme: "搶主旋律" }
  },
  sky_gravity_knot: {
    title: "🪢 重力結",
    description: "一團重力打成死結，靠近時背包忽重忽輕。",
    skyOnly: true,
    buttons: { safe: "慢慢解", risk: "拉緊結", extreme: "切斷重力" }
  },
  sky_blue_spring: {
    title: "💧 藍天泉",
    description: "泉水從雲上往上流，喝下去會讓傷口發光。",
    skyOnly: true,
    buttons: { safe: "洗傷口", risk: "裝一瓶", extreme: "喝下泉心" }
  },
  sky_glass_mine: {
    title: "🔷 玻璃礦脈",
    description: "透明礦脈裡映出好幾條未來路線。",
    skyOnly: true,
    buttons: { safe: "敲邊角", risk: "切開礦脈", extreme: "鑽進倒影" }
  },
  sky_feather_courier: {
    title: "✉️ 羽信使",
    description: "羽信使把一封沒有收件人的信塞進你手裡。",
    skyOnly: true,
    buttons: { safe: "讀信", risk: "送回去", extreme: "拆開封印" }
  },
  sky_aurora_mine: {
    title: "🌌 極光礦帶",
    description: "極光像礦脈一樣流過雲層，顏色一直改變。",
    skyOnly: true,
    buttons: { safe: "採藍光", risk: "追紫光", extreme: "抓住極光核" }
  },
  sky_cloud_whale: {
    title: "🐋 雲鯨掠過",
    description: "巨大的雲鯨從遠方游來，背上掛著古老礦網。",
    skyOnly: true,
    buttons: { safe: "等牠游過", risk: "撈礦網", extreme: "跳上鯨背" }
  },
  sky_angel_ladder: {
    title: "🪜 天梯殘段",
    description: "斷掉的天梯懸在半空，每一階都寫著不同價格。",
    skyOnly: true,
    buttons: { safe: "爬一階", risk: "買一段路", extreme: "踢斷天梯" }
  },
  sky_void_sunflower: {
    title: "🌻 虛空向日葵",
    description: "向日葵面向沒有太陽的地方，花心裡有黑色種子。",
    skyOnly: true,
    buttons: { safe: "採花粉", risk: "挖種子", extreme: "讓它開花" }
  },
  sky_silver_chest: {
    title: "☁️ 雲銀寶箱",
    description: "銀白寶箱卡在雲橋下方，鎖孔冒著薄霧。",
    skyOnly: true,
    buttons: { safe: "敲箱角", risk: "打開寶箱", extreme: "撬開底板" }
  },
  sky_thunder_chest: {
    title: "⚡ 雷鳴寶箱",
    description: "寶箱每隔幾秒放一次電，裡面傳來金屬碰撞聲。",
    skyOnly: true,
    buttons: { safe: "等電停", risk: "快速開箱", extreme: "引雷破箱" }
  },
  sky_mirage_chest: {
    title: "🌫️ 蜃景寶箱",
    description: "寶箱有三個影子，只有一個是真的。",
    skyOnly: true,
    buttons: { safe: "摸影子", risk: "開真箱", extreme: "三個都砸" }
  },
  sky_star_chest: {
    title: "⭐ 星核寶箱",
    description: "箱縫裡有星光滲出，靠近時能量條微微發熱。",
    skyOnly: true,
    buttons: { safe: "吸星光", risk: "打開星核", extreme: "吞下星光" }
  },
  sky_feather_chest: {
    title: "🪶 羽封寶箱",
    description: "箱蓋被羽毛封住，越用力越輕，越輕越難開。",
    skyOnly: true,
    buttons: { safe: "拔羽毛", risk: "順羽開箱", extreme: "逆羽撕開" }
  }
};

Object.assign(RANDOM_EVENTS, GEM_EVENTS, HIGH_EVENTS, REVERSE_EVENTS, SKY_EVENTS);

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
  if (event.skyOnly && player.zone !== "skyDown") return false;
  if (event.highTier && !player.highTierEligible) return false;
  if (event.minDepth && Math.abs(player.depth || 0) < event.minDepth) return false;
  if (event.forceEvacuation && !["mine", "upward", "skyDown"].includes(player.zone)) return false;
  if (event.requiresPathHistory && (!Array.isArray(player.digPathHistory) || player.digPathHistory.length < event.requiresPathHistory)) return false;
  if (!event.caveType && !event.reverseOnly && !event.highTier && player.caveType === "gem") return false;
  if (!event.caveType && !event.reverseOnly && !event.highTier && player.zone === "upward") return false;
  if (!event.caveType && !event.reverseOnly && !event.skyOnly && !event.highTier && player.zone === "skyDown") return false;
  if (!event.requiresGem) return true;
  return (player.redGem || 0) + (player.blueGem || 0) + (player.greenGem || 0) > 0;
}

function getEventTypes(eventId, eventInput = null) {
  const event = eventInput || getRandomEvent(eventId);
  if (!event) return ["special"];
  const types = new Set();
  const qteType = event.qte && event.qte.type;
  if (event.lockpick || eventId.startsWith("lockpick_")) types.add("lockpick");
  else if (qteType === "puzzle" || eventId.startsWith("puzzle_")) types.add("puzzle");
  else if (event.qte || eventId.startsWith("qte_")) types.add("qte");
  if (eventId.includes("chicken")) {
    types.add("wildChicken");
    types.add("race");
  }
  if (eventId.includes("chest") || eventId.includes("vault") || eventId.includes("cache")) types.add("chest");
  if (event.highTier) types.add("highTier");
  if (event.reverseOnly) types.add("underground");
  if (event.skyOnly) types.add("sky");
  if (event.traitSwapEvent || event.forceEvacuation || event.requiresPathHistory || eventId === "gold_eater") types.add("special");
  if (types.size === 0) types.add("special");
  return [...types].filter((type) => EVENT_TYPE_KEYS.includes(type));
}

function getEventTypeBoost(count, challengeMode = false) {
  const short = challengeMode;
  if (count >= (short ? 20 : 40)) return 0.35;
  if (count >= (short ? 10 : 20)) return 0.15;
  if (count >= (short ? 5 : 10)) return 0.05;
  return 0;
}

function getEventTypePityWeight(baseWeight, eventId, eventInput, playerInput = {}, options = {}) {
  const event = eventInput || getRandomEvent(eventId);
  const counter = createEventTypeMissCounter(playerInput.eventTypeMissCounter);
  const recent = Array.isArray(playerInput.recentEventTypes) ? playerInput.recentEventTypes.slice(-5) : [];
  const recentIds = Array.isArray(playerInput.recentEventIds) ? playerInput.recentEventIds.slice(-10) : [];
  const challengeMode = Boolean(options.challengeMode);
  const types = getEventTypes(eventId, event);
  let boost = types.reduce((max, type) => Math.max(max, getEventTypeBoost(counter[type] || 0, challengeMode)), 0);
  if ((baseWeight || 0) <= 0.2 || event.forceEvacuation) boost *= 0.25;
  if (event.highTier) boost *= 0.55;
  let multiplier = 1 + boost;
  const recentHitCount = types.filter((type) => recent.includes(type)).length;
  if (recentHitCount > 0) multiplier *= Math.max(0.42, 0.72 - recentHitCount * 0.08);
  if (recent.length && types.includes(recent[recent.length - 1])) multiplier *= 0.7;
  const sameEventCount = recentIds.filter((id) => id === eventId).length;
  if (sameEventCount > 0) multiplier *= Math.max(0.08, 0.42 - sameEventCount * 0.1);
  if (recentIds[recentIds.length - 1] === eventId) multiplier *= 0.28;
  return Math.max(0.01, baseWeight * multiplier);
}

function advanceEventTypeMissCounters(playerInput, amount = 1) {
  if (!playerInput) return playerInput;
  const counter = createEventTypeMissCounter(playerInput.eventTypeMissCounter);
  const step = Math.max(0, Math.floor(amount || 1));
  EVENT_TYPE_KEYS.forEach((type) => {
    counter[type] = Math.min(999, (counter[type] || 0) + step);
  });
  playerInput.eventTypeMissCounter = counter;
  return playerInput;
}

function recordEventTypeEncounter(playerInput, eventId) {
  if (!playerInput || !eventId) return playerInput;
  const counter = createEventTypeMissCounter(playerInput.eventTypeMissCounter);
  const types = getEventTypes(eventId);
  types.forEach((type) => {
    counter[type] = 0;
  });
  const recent = Array.isArray(playerInput.recentEventTypes) ? playerInput.recentEventTypes : [];
  const recentIds = Array.isArray(playerInput.recentEventIds) ? playerInput.recentEventIds : [];
  playerInput.eventTypeMissCounter = counter;
  playerInput.recentEventTypes = [...recent, ...types].slice(-8);
  playerInput.recentEventIds = [...recentIds, eventId].slice(-12);
  return playerInput;
}

function pickRandomEvent(player, random = Math.random, filter = null) {
  const eventIds = Object.keys(RANDOM_EVENTS).filter((id) => {
    if (filter && !filter(id, RANDOM_EVENTS[id])) return false;
    return canEventAppear(RANDOM_EVENTS[id], player);
  });
  const weighted = eventIds.map((id) => {
    const baseWeight = Math.max(0, RANDOM_EVENTS[id].weight == null ? 1 : RANDOM_EVENTS[id].weight);
    return { id, weight: getEventTypePityWeight(baseWeight, id, RANDOM_EVENTS[id], player) };
  });
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

function pickSkyEvent(player, random = Math.random) {
  return pickRandomEvent(player, random, (id, event) => Boolean(event.skyOnly));
}

function pickRaptorEvent(player, random = Math.random) {
  return pickRandomEvent(player, random, (id) => id.includes("chicken"));
}

function getEventButtonLabels(eventId) {
  const event = getRandomEvent(eventId);
  return event && event.buttons
    ? event.buttons
    : { risk: "冒險選項", safe: "保守選項" };
}

module.exports = {
  RANDOM_EVENTS,
  EVENT_TYPE_KEYS,
  advanceEventTypeMissCounters,
  createEventTypeMissCounter,
  getEventButtonLabels,
  getEventTypes,
  getEventTypePityWeight,
  getRandomEvent,
  getRandomEvents,
  pickGemEvent,
  pickHighTierEvent,
  pickReverseEvent,
  pickRaptorEvent,
  pickSkyEvent,
  pickRandomEvent,
  recordEventTypeEncounter
};
