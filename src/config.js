"use strict";

const CONFIG = {
  mining: {
    weights: {
      gold: 52,
      rusty: 16,
      empty: 22,
      bomb: 10
    }
  },
  exchange: {
    goldPerCommemorative: 10
  },
  shop: {
    items: [
      {
        id: "zhongkui_peace",
        priceGold: 80
      }
    ]
  },
  rustRemoval: {
    default: {
      label: "除鏽",
      costGold: 5,
      successRate: 0.7
    }
  },
  revive: {
    freeAfterMs: 10 * 60 * 1000,
    costGold: 20
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
