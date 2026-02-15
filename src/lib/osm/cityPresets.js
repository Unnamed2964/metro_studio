/**
 * City presets for OSM metro network import.
 * Each entry contains the city's OSM admin boundary relation ID,
 * display names, and a center coordinate for map positioning.
 *
 * relationId: OSM relation ID for the city's administrative boundary.
 * center: [longitude, latitude] — used for initial map view.
 * zoom: suggested initial zoom level for the city extent.
 */

const CITY_PRESETS = [
  // ── 中国大陆 ──────────────────────────────────────────────
  { id: 'jinan',        name: '济南',     nameEn: 'Jinan',        relationId: 3486449, center: [117.00, 36.65], zoom: 11 },
  { id: 'beijing',      name: '北京',     nameEn: 'Beijing',      relationId: 912940,  center: [116.40, 39.90], zoom: 10 },
  { id: 'shanghai',     name: '上海',     nameEn: 'Shanghai',     relationId: 913067,  center: [121.47, 31.23], zoom: 10 },
  { id: 'guangzhou',    name: '广州',     nameEn: 'Guangzhou',    relationId: 3287346, center: [113.26, 23.13], zoom: 10 },
  { id: 'shenzhen',     name: '深圳',     nameEn: 'Shenzhen',     relationId: 3464353, center: [114.06, 22.55], zoom: 11 },
  { id: 'chengdu',      name: '成都',     nameEn: 'Chengdu',      relationId: 2110264, center: [104.07, 30.57], zoom: 10 },
  { id: 'wuhan',        name: '武汉',     nameEn: 'Wuhan',        relationId: 3076268, center: [114.30, 30.59], zoom: 10 },
  { id: 'hangzhou',     name: '杭州',     nameEn: 'Hangzhou',     relationId: 3221112, center: [120.15, 30.27], zoom: 10 },
  { id: 'nanjing',      name: '南京',     nameEn: 'Nanjing',      relationId: 2131524, center: [118.80, 32.06], zoom: 10 },
  { id: 'chongqing',    name: '重庆',     nameEn: 'Chongqing',    relationId: 913069,  center: [106.55, 29.56], zoom: 10 },
  { id: 'tianjin',      name: '天津',     nameEn: 'Tianjin',      relationId: 912999,  center: [117.20, 39.13], zoom: 10 },
  { id: 'suzhou',       name: '苏州',     nameEn: 'Suzhou',       relationId: 4430941, center: [120.62, 31.30], zoom: 11 },
  { id: 'zhengzhou',    name: '郑州',     nameEn: 'Zhengzhou',    relationId: 3283765, center: [113.65, 34.76], zoom: 11 },
  { id: 'xian',         name: '西安',     nameEn: "Xi'an",        relationId: 3226004, center: [108.94, 34.26], zoom: 10 },
  { id: 'changsha',     name: '长沙',     nameEn: 'Changsha',     relationId: 3202711, center: [112.97, 28.23], zoom: 11 },
  { id: 'kunming',      name: '昆明',     nameEn: 'Kunming',      relationId: 2723597, center: [102.83, 25.02], zoom: 10 },
  { id: 'dalian',       name: '大连',     nameEn: 'Dalian',       relationId: 2764565, center: [121.61, 38.91], zoom: 10 },
  { id: 'qingdao',      name: '青岛',     nameEn: 'Qingdao',      relationId: 3469133, center: [120.38, 36.07], zoom: 10 },
  { id: 'shenyang',     name: '沈阳',     nameEn: 'Shenyang',     relationId: 2769604, center: [123.43, 41.80], zoom: 10 },
  { id: 'harbin',       name: '哈尔滨',   nameEn: 'Harbin',       relationId: 2755608, center: [126.63, 45.75], zoom: 10 },
  { id: 'fuzhou',       name: '福州',     nameEn: 'Fuzhou',       relationId: 3263977, center: [119.30, 26.08], zoom: 11 },
  { id: 'xiamen',       name: '厦门',     nameEn: 'Xiamen',       relationId: 3242930, center: [118.09, 24.48], zoom: 11 },
  { id: 'hefei',        name: '合肥',     nameEn: 'Hefei',        relationId: 3288965, center: [117.28, 31.86], zoom: 11 },
  { id: 'nanchang',     name: '南昌',     nameEn: 'Nanchang',     relationId: 3169865, center: [115.86, 28.68], zoom: 11 },
  { id: 'nanning',      name: '南宁',     nameEn: 'Nanning',      relationId: 2775778, center: [108.37, 22.82], zoom: 11 },
  { id: 'guiyang',      name: '贵阳',     nameEn: 'Guiyang',      relationId: 2782246, center: [106.63, 26.65], zoom: 11 },
  { id: 'urumqi',       name: '乌鲁木齐', nameEn: 'Urumqi',       relationId: 2752472, center: [87.62, 43.83],  zoom: 11 },
  { id: 'lanzhou',      name: '兰州',     nameEn: 'Lanzhou',      relationId: 2701949, center: [103.83, 36.06], zoom: 11 },
  { id: 'taiyuan',      name: '太原',     nameEn: 'Taiyuan',      relationId: 3296588, center: [112.55, 37.87], zoom: 11 },
  { id: 'shijiazhuang', name: '石家庄',   nameEn: 'Shijiazhuang', relationId: 3009732, center: [114.51, 38.04], zoom: 11 },
  { id: 'changchun',    name: '长春',     nameEn: 'Changchun',    relationId: 2763992, center: [125.32, 43.88], zoom: 10 },
  { id: 'wuxi',         name: '无锡',     nameEn: 'Wuxi',         relationId: 4430942, center: [120.31, 31.49], zoom: 11 },
  { id: 'changzhou',    name: '常州',     nameEn: 'Changzhou',    relationId: 3429666, center: [119.97, 31.77], zoom: 11 },
  { id: 'xuzhou',       name: '徐州',     nameEn: 'Xuzhou',       relationId: 3218572, center: [117.28, 34.26], zoom: 11 },
  { id: 'foshan',       name: '佛山',     nameEn: 'Foshan',       relationId: 3464719, center: [113.12, 23.02], zoom: 11 },
  { id: 'dongguan',     name: '东莞',     nameEn: 'Dongguan',     relationId: 3464319, center: [113.75, 23.05], zoom: 11 },
  { id: 'ningbo',       name: '宁波',     nameEn: 'Ningbo',       relationId: 3478607, center: [121.55, 29.87], zoom: 11 },
  { id: 'wenzhou',      name: '温州',     nameEn: 'Wenzhou',      relationId: 3289341, center: [120.70, 28.00], zoom: 11 },
  { id: 'shaoxing',     name: '绍兴',     nameEn: 'Shaoxing',     relationId: 3316522, center: [120.58, 30.00], zoom: 11 },
  { id: 'luoyang',      name: '洛阳',     nameEn: 'Luoyang',      relationId: 3246491, center: [112.45, 34.62], zoom: 11 },
  { id: 'wuhu',         name: '芜湖',     nameEn: 'Wuhu',         relationId: 3262036, center: [118.38, 31.33], zoom: 11 },

  // ── 港澳台 ────────────────────────────────────────────────
  { id: 'hongkong',     name: '香港',     nameEn: 'Hong Kong',    relationId: 913110,  center: [114.17, 22.32], zoom: 11 },
  { id: 'taipei',       name: '台北',     nameEn: 'Taipei',       relationId: 1293250, center: [121.57, 25.05], zoom: 12 },

  // ── 国际城市 ──────────────────────────────────────────────
  { id: 'tokyo',        name: '东京',     nameEn: 'Tokyo',        relationId: 1543125, center: [139.69, 35.69], zoom: 10 },
  { id: 'seoul',        name: '首尔',     nameEn: 'Seoul',        relationId: 2297418, center: [126.98, 37.57], zoom: 11 },
  { id: 'london',       name: '伦敦',     nameEn: 'London',       relationId: 175342,  center: [-0.12, 51.51],  zoom: 10 },
  { id: 'paris',        name: '巴黎',     nameEn: 'Paris',        relationId: 7444,    center: [2.35, 48.86],   zoom: 11 },
  { id: 'newyork',      name: '纽约',     nameEn: 'New York',     relationId: 175905,  center: [-74.01, 40.71], zoom: 10 },
  { id: 'moscow',       name: '莫斯科',   nameEn: 'Moscow',       relationId: 102269,  center: [37.62, 55.75],  zoom: 10 },
  { id: 'singapore',    name: '新加坡',   nameEn: 'Singapore',    relationId: 536780,  center: [103.85, 1.29],  zoom: 11 },
  { id: 'bangkok',      name: '曼谷',     nameEn: 'Bangkok',      relationId: 92277,   center: [100.50, 13.76], zoom: 11 },
  { id: 'delhi',        name: '德里',     nameEn: 'Delhi',        relationId: 2763541, center: [77.21, 28.61],  zoom: 11 },
  { id: 'cairo',        name: '开罗',     nameEn: 'Cairo',        relationId: 5466227, center: [31.24, 30.04],  zoom: 11 },
  { id: 'istanbul',     name: '伊斯坦布尔', nameEn: 'Istanbul',   relationId: 223474,  center: [28.98, 41.01],  zoom: 10 },
  { id: 'berlin',       name: '柏林',     nameEn: 'Berlin',       relationId: 62422,   center: [13.41, 52.52],  zoom: 11 },
  { id: 'madrid',       name: '马德里',   nameEn: 'Madrid',       relationId: 5326784, center: [-3.70, 40.42],  zoom: 11 },
  { id: 'barcelona',    name: '巴塞罗那', nameEn: 'Barcelona',    relationId: 347950,  center: [2.17, 41.39],   zoom: 12 },
  { id: 'stockholm',    name: '斯德哥尔摩', nameEn: 'Stockholm',  relationId: 398021,  center: [18.07, 59.33],  zoom: 11 },
  { id: 'vienna',       name: '维也纳',   nameEn: 'Vienna',       relationId: 109166,  center: [16.37, 48.21],  zoom: 11 },
  { id: 'prague',       name: '布拉格',   nameEn: 'Prague',       relationId: 435514,  center: [14.42, 50.08],  zoom: 11 },
  { id: 'budapest',     name: '布达佩斯', nameEn: 'Budapest',     relationId: 1244004, center: [19.04, 47.50],  zoom: 11 },
]

/**
 * Find a city preset by its id string.
 * @param {string} id
 * @returns {object|undefined}
 */
export function findCityPresetById(id) {
  return CITY_PRESETS.find((preset) => preset.id === id)
}

/**
 * Find a city preset by its OSM relation ID.
 * @param {number} relationId
 * @returns {object|undefined}
 */
export function findCityPresetByRelationId(relationId) {
  return CITY_PRESETS.find((preset) => preset.relationId === relationId)
}

export { CITY_PRESETS }
