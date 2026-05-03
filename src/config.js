"use strict";

const CONFIG = {
  mining: {
    baseHp: 2,
    gemCaveChance: 0.08,
    weights: {
      gold: 48,
      ore: 14,
      goldOre: 0,
      platinumOre: 0,
      rusty: 6,
      junk: 6,
      empty: 16,
      bomb: 10
    },
    gemWeights: {
      redGem: 32,
      blueGem: 24,
      greenGem: 14,
      stalactite: 18,
      platinumJunk: 12
    }
  },
  runModes: {
    double: {
      label: "雙倍採集",
      gatherMultiplier: 2,
      deathPenaltyMultiplier: 2
    },
    safe: {
      label: "安全血量",
      extraHp: 2,
      rustyWeightMultiplier: 0.5
    },
    goldRush: {
      label: "淘金熱",
      goldMultiplierBonus: 0.35
    },
    bigBag: {
      label: "大背包",
      bagBonusSlots: 4
    },
    bombProof: {
      label: "防爆外套",
      bombWeightMultiplier: 0.75
    }
  },
  minorBuffs: {
    gold: {
      label: "金幣磁條",
      goldMultiplierBonus: 0.05
    },
    bomb: {
      label: "防爆磁條",
      bombWeightMultiplier: 0.95
    }
  },
  ore: {
    goldPerOre: 8,
    goldPerGoldOre: 120,
    goldPerPlatinumOre: 260,
    redGemGold: 35,
    blueGemGold: 50,
    greenGemGold: 75
  },
  exchange: {
    goldPerCommemorative: 100
  },
  shop: {
    items: [
      {
        id: "zhongkui_peace",
        priceGold: 800
      }
    ]
  },
  rustRemoval: {
    default: {
      label: "除鏽",
      costGold: 150,
      successRate: 0.45
    }
  },
  revive: {
    freeAfterMs: 10 * 60 * 1000,
    rescueRefundAfterMs: 3 * 60 * 1000,
    costGold: 200,
    rescueCostGold: 20
  },
  collectibles: [
    {
      id: "nina_hot_water",
      name: "喝熱水紀念幣",
      rarity: "普通",
      weight: 26,
      image: "assets/collectibles/nina-01.png"
    },
    {
      id: "meijiang_done",
      name: "好了啦紀念幣",
      rarity: "普通",
      weight: 24,
      image: "assets/collectibles/meijiang-03.png"
    },
    {
      id: "meijiang_question",
      name: "疑問美醬紀念幣",
      rarity: "稀有",
      weight: 14,
      image: "assets/collectibles/meijiang-04.png"
    },
    {
      id: "rose_zongzi",
      name: "製粽 Rose 紀念幣",
      rarity: "普通",
      weight: 20,
      image: "assets/collectibles/rose-01.png"
    },
    {
      id: "rose_thumbs",
      name: "讚讚 Rose 紀念幣",
      rarity: "稀有",
      weight: 10,
      image: "assets/collectibles/rose-02.png"
    },
    {
      id: "rose_cup",
      name: "燒杯 Rose 紀念幣",
      rarity: "史詩",
      weight: 5,
      image: "assets/collectibles/rose-03.png"
    },
    {
      id: "rose_smirk",
      name: "嘻嘻 Rose 紀念幣",
      rarity: "傳說",
      weight: 1,
      image: "assets/collectibles/rose-04.png"
    },
    {
      id: "rose_rust_annoyed",
      name: "不悅 Rose 紀念幣",
      rarity: "除鏽限定",
      weight: 18,
      rustOnly: true,
      image: "assets/collectibles/rose-rust-01.png"
    },
    {
      id: "rose_rust_tuba",
      name: "大號 Rose 紀念幣",
      rarity: "除鏽限定",
      weight: 14,
      rustOnly: true,
      image: "assets/collectibles/rose-rust-02.png"
    },
    {
      id: "rose_rust_builder",
      name: "砌牆 Rose 紀念幣",
      rarity: "除鏽限定",
      weight: 14,
      rustOnly: true,
      image: "assets/collectibles/rose-rust-03.png"
    },
    {
      id: "rose_rust_drink",
      name: "飲料 Rose 紀念幣",
      rarity: "除鏽限定",
      weight: 18,
      rustOnly: true,
      image: "assets/collectibles/rose-rust-04.png"
    },
    {
      id: "rose_rust_blank",
      name: "冷淡 Rose 紀念幣",
      rarity: "除鏽限定",
      weight: 16,
      rustOnly: true,
      image: "assets/collectibles/rose-rust-05.png"
    },
    {
      id: "rose_rust_laugh",
      name: "偷笑 Rose 紀念幣",
      rarity: "除鏽限定",
      weight: 12,
      rustOnly: true,
      image: "assets/collectibles/rose-rust-06.png"
    },
    {
      id: "rose_rust_pickup",
      name: "撿金幣 Rose 紀念幣",
      rarity: "除鏽限定",
      weight: 10,
      rustOnly: true,
      image: "assets/collectibles/rose-rust-07.png"
    },
    {
      id: "rose_rust_bird",
      name: "抱鳥 Rose 紀念幣",
      rarity: "除鏽限定",
      weight: 8,
      rustOnly: true,
      image: "assets/collectibles/rose-rust-08.png"
    },
    {
      id: "rose_rust_idea",
      name: "靈光 Rose 紀念幣",
      rarity: "除鏽限定",
      weight: 12,
      rustOnly: true,
      image: "assets/collectibles/rose-rust-09.png"
    },
    {
      id: "rose_rust_scratch",
      name: "抓頭 Rose 紀念幣",
      rarity: "除鏽限定",
      weight: 10,
      rustOnly: true,
      image: "assets/collectibles/rose-rust-10.png"
    },
    {
      id: "zhongkui_peace",
      name: "鍾葵限定紀念幣",
      rarity: "商店限定",
      weight: 0,
      shopOnly: true,
      image: "assets/collectibles/zhongkui-01.png"
    }
  ]
};

module.exports = { CONFIG };
