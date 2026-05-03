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
    },
    digPathTypes: {
      steady: {
        label: "穩固石壁",
        description: "安全支道",
        rewardMultiplier: 0.85,
        weightMultipliers: {
          gold: 0.9,
          ore: 0.9,
          goldOre: 0.9,
          platinumOre: 0.9,
          rusty: 0.85,
          junk: 0.8,
          bomb: 0.7,
          empty: 1.25,
          redGem: 0.85,
          blueGem: 0.85,
          greenGem: 0.85,
          stalactite: 0.7,
          platinumJunk: 0.8
        }
      },
      greedy: {
        label: "貪婪裂隙",
        description: "貪婪裂隙",
        rewardMultiplier: 1.3,
        weightMultipliers: {
          gold: 1.2,
          ore: 1.25,
          goldOre: 1.25,
          platinumOre: 1.25,
          rusty: 1.2,
          junk: 1.25,
          bomb: 1.35,
          empty: 0.75,
          redGem: 1.3,
          blueGem: 1.3,
          greenGem: 1.3,
          stalactite: 1.35,
          platinumJunk: 1.35
        }
      },
      glitter: {
        label: "閃光礦脈",
        description: "金幣更多但更容易出炸彈",
        rewardMultiplier: 1.2,
        weightMultipliers: {
          gold: 1.55,
          ore: 0.9,
          goldOre: 1.1,
          platinumOre: 1.1,
          rusty: 0.8,
          junk: 0.9,
          bomb: 1.2,
          empty: 0.75,
          redGem: 1.05,
          blueGem: 1.05,
          greenGem: 1.05,
          stalactite: 1.15,
          platinumJunk: 0.95
        }
      },
      oreVein: {
        label: "厚重礦壁",
        description: "礦石多但佔包包",
        rewardMultiplier: 1.1,
        weightMultipliers: {
          gold: 0.75,
          ore: 1.7,
          goldOre: 1.5,
          platinumOre: 1.5,
          rusty: 0.9,
          junk: 1.15,
          bomb: 0.95,
          empty: 0.8,
          redGem: 1.15,
          blueGem: 1.15,
          greenGem: 1.15,
          stalactite: 0.95,
          platinumJunk: 1.2
        }
      },
      rustyCrack: {
        label: "鏽色裂縫",
        description: "較容易出鏽幣與破爛",
        rewardMultiplier: 1,
        weightMultipliers: {
          gold: 0.85,
          ore: 0.9,
          goldOre: 0.9,
          platinumOre: 0.9,
          rusty: 1.65,
          junk: 1.45,
          bomb: 0.9,
          empty: 0.85,
          redGem: 0.9,
          blueGem: 0.9,
          greenGem: 0.9,
          stalactite: 0.9,
          platinumJunk: 1.45
        }
      },
      hollow: {
        label: "空心坑道",
        description: "空挖多但最不容易出事",
        rewardMultiplier: 0.75,
        weightMultipliers: {
          gold: 0.75,
          ore: 0.75,
          goldOre: 0.75,
          platinumOre: 0.75,
          rusty: 0.7,
          junk: 0.65,
          bomb: 0.55,
          empty: 2,
          redGem: 0.75,
          blueGem: 0.75,
          greenGem: 0.75,
          stalactite: 0.55,
          platinumJunk: 0.65
        }
      },
      unstable: {
        label: "炸裂裂縫",
        description: "掉落豐厚但爆炸很兇",
        rewardMultiplier: 1.45,
        weightMultipliers: {
          gold: 1.15,
          ore: 1.3,
          goldOre: 1.4,
          platinumOre: 1.4,
          rusty: 1.1,
          junk: 1.25,
          bomb: 1.8,
          empty: 0.55,
          redGem: 1.35,
          blueGem: 1.35,
          greenGem: 1.35,
          stalactite: 1.8,
          platinumJunk: 1.4
        }
      }
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
    },
    fireDragonPickaxe: {
      label: "火龍十字鎬",
      depthStep: 2,
      smeltedSurfaceMultiplier: 1.5,
      smeltedGoblinMultiplier: 0.55,
      megaBombChance: 0.35
    },
    silkTouch: {
      label: "絲綢之觸",
      rawGoblinMultiplier: 1.7,
      bombCaptureChance: 0.4
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
    goldPerGoldBlock: 2,
    goldPerOreIngot: 12,
    goldPerGoldOreIngot: 180,
    goldPerPlatinumOreIngot: 390,
    goldPerBombItem: 90,
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
    ],
    consumables: {
      healingPotion: {
        label: "治療藥水",
        priceGold: 100,
        unlockBestDepth: 70,
        healBombs: 1
      },
      undyingTotem: {
        label: "不死圖騰",
        priceGold: 500,
        unlockDeaths: 100
      }
    }
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
