# lib/osm

OSM 数据导入链路。

## 文件说明

- **overpassClient.js** — Overpass API 请求封装，支持主/备端点重试、全局限流、429 退避、端点熔断、内存缓存、in-flight 去重
- **genericImporter.js** — 通用城市地铁 OSM 导入器（非济南专用）
- **cityPresets.js** — 城市预设配置（OSM relation ID、默认参数）
- **importJinanMetro.js** — 对外兼容入口，转发到 `jinan/importer.js`
- **jinan/** — 济南导入实现子模块，详见 `jinan/README.md`
