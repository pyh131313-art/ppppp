"use strict";

const CONFIG = {
  mining: {
    baseHp: 2,
    gemCaveChance: 0.08,
    runModeRerollCostGold: 10,
    lavaDepth: 100,
    skyDepth: -100,
    lavaRounds: 3,
    weights: {
      gold: 48,
      ore: 14,
      goldOre: 0,
      platinumOre: 0,
      rusty: 6,
      junk: 6,
      empty: 16,
      bomb: 10,
      stalactite: 4
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
      },
      coinPit: {
        label: "金光坑洞",
        description: "跳下去會受傷，但能撿錢並跳層",
        special: "pit",
        pitReward: "gold",
        jumpDepth: [1, 2],
        damage: 1,
        rewardMultiplier: 1.15,
        weightMultipliers: {}
      },
      orePit: {
        label: "碎礦坑洞",
        description: "跳下去會受傷，但能撿礦並跳層",
        special: "pit",
        pitReward: "ore",
        jumpDepth: [1, 2],
        damage: 1,
        rewardMultiplier: 1.1,
        weightMultipliers: {}
      },
      deepPit: {
        label: "深不見底",
        description: "跳層最多，獎勵較好但更痛",
        special: "pit",
        pitReward: "mixed",
        jumpDepth: [2, 3],
        damage: 2,
        rewardMultiplier: 1.35,
        weightMultipliers: {}
      }
    }
  },
  balance: {
    pressureStartDepth: 40,
    pressureMaxBombBonus: 0.35,
    pressureMaxNegativeEventBonus: 0.25,
    recordFatigueWindowMs: 60 * 60 * 1000,
    recordFatigueDangerBonus: 0.15,
    campElevatorCooldownMs: 10 * 60 * 1000,
    personalSupplyFloor: 0.7
  },
  runModes: {
    double: {
      name: "雙倍採集",
      label: "雙倍採集",
      shortDescription: "採集x2｜死亡扣金x2",
      gatherMultiplier: 2,
      deathPenaltyMultiplier: 2
    },
    safe: {
      name: "安全血量",
      label: "安全血量",
      shortDescription: "生命+2｜鏽幣-50%",
      extraHp: 2,
      rustyWeightMultiplier: 0.5
    },
    goldRush: {
      name: "淘金熱",
      label: "淘金熱",
      shortDescription: "金幣+35%",
      goldMultiplierBonus: 0.35
    },
    bigBag: {
      name: "大背包",
      label: "大背包",
      shortDescription: "包包+4",
      bagBonusSlots: 4
    },
    bombProof: {
      name: "防爆外套",
      label: "防爆外套",
      shortDescription: "炸彈-25%｜閃避爆炸",
      bombWeightMultiplier: 0.75,
      bombDodgeChance: 0.25
    },
    fireDragonPickaxe: {
      name: "火龍十字鎬",
      label: "火龍十字鎬",
      shortDescription: "層數+2｜包包+6｜熔煉+",
      depthStep: 2,
      bagBonusSlots: 6,
      goldMultiplierBonus: 0.15,
      oreRewardMultiplier: 1.25,
      smeltedSurfaceMultiplier: 1.5,
      smeltedGoblinMultiplier: 0.55,
      megaBombChance: 0.2
    },
    silkTouch: {
      name: "絲綢之觸",
      label: "絲綢之觸",
      shortDescription: "原礦保留｜地精價+｜炸彈→物品",
      rawGoblinMultiplier: 1.7,
      bombCaptureChance: 0.4
    },
    chainBlast: {
      name: "連鎖爆破",
      label: "連鎖爆破",
      shortDescription: "踩炸彈→收益+30%｜最多5",
      chainBlast: true
    },
    refiningInstinct: {
      name: "精煉本能",
      label: "精煉本能",
      shortDescription: "礦石→錠｜金幣-30%",
      refiningInstinct: true,
      goldMultiplierBonus: -0.3
    },
    greedyLoop: {
      name: "貪婪循環",
      label: "貪婪循環",
      shortDescription: "金幣→下次+20%｜受傷歸零",
      greedyLoop: true
    },
    dangerSense: {
      name: "危險感知",
      label: "危險感知",
      shortDescription: "50%避炸彈｜空挖+40%",
      dangerSense: true,
      emptyWeightMultiplier: 1.4
    },
    anomalousBackpack: {
      name: "異常背包",
      label: "異常背包",
      shortDescription: "包包+6｜每層20%破爛",
      bagBonusSlots: 6,
      anomalousBackpack: true
    },
    abyssMiner: {
      name: "深淵礦工",
      label: "深淵礦工",
      shortDescription: "深層收益++｜炸彈+",
      deepInstinct: true,
      bombWeightMultiplier: 1.18,
      deepRewardMultiplier: 1.45,
      nextRunOnly: true
    },
    gemMania: {
      name: "寶石狂熱",
      label: "寶石狂熱",
      shortDescription: "寶石+50%｜普通礦-",
      gemRewardMultiplier: 1.5,
      oreRewardMultiplier: 0.75,
      gemCaveChanceBonus: 0.16,
      nextRunOnly: true
    },
    blastManiac: {
      name: "爆破狂徒",
      label: "爆破狂徒",
      shortDescription: "炸彈可回收｜死亡扣金+",
      blastRecycle: true,
      bombWeightMultiplier: 1.25,
      deathPenaltyMultiplier: 1.5,
      nextRunOnly: true
    },
    luckySurvey: {
      name: "幸運探勘",
      label: "幸運探勘",
      shortDescription: "爆擊+12%｜空挖+",
      critChanceBonus: 0.12,
      emptyWeightMultiplier: 1.25,
      nextRunOnly: true
    },
    limitBackpack: {
      name: "極限背包",
      label: "極限背包",
      shortDescription: "包包+10｜層數慢",
      bagBonusSlots: 10,
      slowDepthChance: 0.35,
      nextRunOnly: true
    },
    bagExpansion: {
      name: "背包擴充",
      label: "背包擴充",
      shortDescription: "本輪包包+2",
      bagBonusSlots: 2
    },
    deepInstinct: {
      name: "深層直覺",
      label: "深層直覺",
      shortDescription: "每10層收益+10%｜炸彈+",
      deepInstinct: true,
      bombWeightMultiplier: 1.08
    },
    oreFocus: {
      name: "礦脈專注",
      label: "礦脈專注",
      shortDescription: "礦石+30%｜金幣-15%",
      oreRewardMultiplier: 1.3,
      goldMultiplierBonus: -0.15
    },
    gemScent: {
      name: "寶石嗅覺",
      label: "寶石嗅覺",
      shortDescription: "寶石洞+｜寶石危險+",
      gemCaveChanceBonus: 0.12,
      gemDangerMultiplier: 1.2
    },
    blastRecycle: {
      name: "炸裂回收",
      label: "炸裂回收",
      shortDescription: "被炸給金｜炸彈+15%",
      blastRecycle: true,
      bombWeightMultiplier: 1.15
    },
    eventBody: {
      name: "事件體質",
      label: "事件體質",
      shortDescription: "事件率+｜負面+",
      eventChanceBonus: 0.15,
      negativeEventWeightBonus: 0.15
    },
    reversePrep: {
      name: "逆行準備",
      label: "逆行準備",
      shortDescription: "上挖顛倒+20%｜下挖-10%",
      reverseRewardMultiplier: 1.2,
      downRewardMultiplier: 0.9
    },
    chickenBlood: {
      name: "雞血沸騰",
      label: "雞血沸騰",
      shortDescription: "生命+1｜前5層收益+30%",
      extraHp: 1,
      earlyRewardMultiplier: 1.3,
      oneTimeChickenTrait: true
    },
    goldCrownLuck: {
      name: "金冠賭運",
      label: "金冠賭運",
      shortDescription: "爆擊率+10%",
      critChanceBonus: 0.1,
      oneTimeChickenTrait: true
    },
    cuckooCharm: {
      name: "咕咕護符",
      label: "咕咕護符",
      shortDescription: "第一次炸彈減傷",
      firstBombDamageReduction: true,
      oneTimeChickenTrait: true
    },
    comebackChickenSoul: {
      name: "逆轉雞魂",
      label: "逆轉雞魂",
      shortDescription: "低血收益+50%",
      lowHpRewardMultiplier: 1.5,
      oneTimeChickenTrait: true
    },
    roastChickenScent: {
      name: "烤雞餘香",
      label: "烤雞餘香",
      shortDescription: "包包+3｜破爛轉金",
      bagBonusSlots: 3,
      junkToGold: true,
      oneTimeChickenTrait: true
    }
  },
  minorBuffs: {
    gold: {
      label: "金幣磁條",
      goldMultiplierBonus: 0.05,
      maxStacks: 5,
      breakthroughScale: 0.3,
      breakthroughWeight: 0.45
    },
    bomb: {
      label: "防爆磁條",
      bombWeightMultiplier: 0.95,
      maxStacks: 5,
      breakthroughScale: 0.3,
      breakthroughWeight: 0.45
    },
    bag: {
      label: "包包擴充",
      bagBonusSlots: 2,
      maxStacks: 5,
      breakthroughScale: 0.25,
      breakthroughWeight: 0.35
    },
    ore: {
      label: "小型礦脈",
      oreMultiplierBonus: 0.08,
      maxStacks: 5,
      breakthroughScale: 0.3,
      breakthroughWeight: 0.45
    },
    sustain: {
      label: "小型續航",
      healEveryDepth: 10,
      maxStacks: 3,
      breakthroughScale: 0.2,
      breakthroughWeight: 0.25
    },
    luck: {
      label: "小型幸運",
      critChanceBonus: 0.03,
      maxStacks: 5,
      breakthroughScale: 0.3,
      breakthroughWeight: 0.45
    },
    event: {
      label: "小型事件感知",
      eventChanceBonus: 0.05,
      maxStacks: 5,
      breakthroughScale: 0.3,
      breakthroughWeight: 0.45
    },
    reverse: {
      label: "小型顛倒感應",
      reverseRewardBonus: 0.05,
      maxStacks: 5,
      breakthroughScale: 0.3,
      breakthroughWeight: 0.45
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
    greenGemGold: 75,
    invertedOreGold: 0,
    invertedGemGold: 0,
    orichalcumGold: 0
  },
  market: {
    cycleMs: 3 * 60 * 60 * 1000,
    minMultiplier: 0.6,
    maxMultiplier: 1.6,
    trackedItems: ["ore", "goldOre", "platinumOre", "oreIngot", "goldOreIngot", "platinumOreIngot"]
  },
  exchange: {
    goldPerCommemorative: 100
  },
  shop: {
    shimmerPool: {
      costGold: 400
    },
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
        healBombs: 1,
        hourlyStock: 20,
        dailyLimit: 10,
        cooldownLayers: 4
      },
      undyingTotem: {
        label: "不死圖騰",
        priceGold: 500,
        unlockDeaths: 100
      },
      magicCandy: {
        label: "神奇糖果",
        assetRate: 0.02,
        dailyLimit: 2
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
