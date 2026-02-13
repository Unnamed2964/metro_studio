# lib/osm 目录说明

该目录负责 OSM 数据导入链路。

- `overpassClient.js`
  - 封装 Overpass 请求
  - 支持主/备端点重试（开发代理 + 公网端点）
  - 单端点超时控制与失败链路聚合
- `importJinanMetro.js`
  - 生成 Overpass 查询语句
  - 解析 relation/way/node 拓扑
  - 按在建/规划开关过滤线路
  - 识别环线并在导入阶段规范化线路名（去除“从哪到哪”后缀）
  - 根据行政边界过滤站点
  - 输出标准化工程网络数据（stations/edges/lines）

当前区域配置：

- 济南市行政区（relation `3486449`）
