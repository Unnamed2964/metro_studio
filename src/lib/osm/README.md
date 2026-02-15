# lib/osm 目录说明

该目录负责 OSM 数据导入链路。

- `overpassClient.js`
  - 封装 Overpass 请求
  - 支持主/备端点重试（开发代理 + 公网端点）
  - 内置全局限流队列（并发上限 + 发包间隔），避免批量命名时触发 Overpass 429
  - 支持 429 自动退避（读取 `Retry-After`）与 404/410 端点熔断
  - 单端点超时控制与失败链路聚合
  - 支持短时内存缓存与同查询 in-flight 去重，减少重复查询
  - 可通过环境变量调参：`VITE_OVERPASS_MAX_CONCURRENCY`、`VITE_OVERPASS_MIN_INTERVAL_MS`、`VITE_OVERPASS_MAX_RETRIES`、`VITE_OVERPASS_RETRY_BASE_DELAY_MS`、`VITE_OVERPASS_ENDPOINT_COOLDOWN_MS`、`VITE_OVERPASS_CACHE_TTL_MS`
- `nearbyStationNamingContext.js`
  - 基于 Overpass 的站点周边命名语义提取
  - 按半径聚合道路/道路交叉口/地域/公共设施/建筑并输出排序结果（含距离、重要度、来源）
  - 输出不做类别条数截断：返回排序后的完整候选集合（受查询半径与 OSM 原始数据量约束）
  - 每条候选附带结构化 `meta`（如 `roadClass/roadClassLabel`、`adminLevel`、`place/landuse`、设施类别等），用于上游 AI 命名阶段直接读取道路等级与片区分类
  - 交叉口识别基于道路几何近距与夹角，支持在主干路与次干路交汇场景输出交叉口证据
- `importJinanMetro.js`
  - 对外兼容入口（转发到 `jinan/importer.js`）
- `jinan/`
  - 济南导入实现子模块（查询、状态判定、命名、拓扑合并、导入主流程）
  - 详见 `jinan/README.md`

当前区域配置：

- 济南市行政区（relation `3486449`）
