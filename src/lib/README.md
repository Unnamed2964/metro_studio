# lib 目录说明

该目录存放核心业务逻辑与通用函数，按子域拆分：

- `colors.js`：线路颜色选择与颜色规范化（含基于现有线路颜色差异度的自动选色）。
- `geo.js`：地理/几何计算（投影、距离、相交、包围盒、八向折线路径生成，含近似直线合并避免阶梯化）。
- `ids.js`：全局 ID 生成。
- `lineNaming.js`：线路命名工具（环线名去“起终点”后缀、显示名归一化）。
- `lineStyles.js`：线路线型定义与归一化（单线/双线、虚线、点线等跨渲染层配置）。
- `projectModel.js`：工程数据模型与标准化（含线路状态、线型、自动排版配置 `layoutConfig`、线段级线型覆盖 `lineStyleOverride`）。
- `transfer.js`：手动换乘关系工具（站点对归一化、换乘联通分组、有效换乘线路集合计算）。
- `uiPreferences.js`：UI 主题/字体偏好定义与归一化（本地持久化键、选项集、默认值）。
- `ai/`：LLM 能力封装（站点命名候选生成、结构化 JSON 校验与回退）。
- `hud/`：车辆 HUD 渲染模型（线路主路径、方向、换乘标识、超长单弯折返）。
- `export/`：导出逻辑（实际走向图 PNG、官方风格图 PNG、车辆 HUD ZIP）。
- `layout/`：布局 Worker 调用端。
- `ranking/`：全球轨道交通排行榜与工程里程排名计算（Wikipedia 实时榜单解析）。
- `schematic/`：示意图渲染模型（预览与导出共享，支持线段级线型覆盖）。
- `osm/`：OSM 导入与 Overpass 请求。
  - `osm/jinan/`：济南导入主流程分层实现（查询、命名、状态、拓扑、入口编排）。
  - `osm/nearbyStationNamingContext.js`：按半径提取站点周边命名语义要素（道路、地域、公共设施、建筑）。
- `storage/`：本地存储与工程文件读写（含线段级线型覆盖持久化）。
- `timeline/`：时间轴动画引擎。
  - `timelineAnimationPlan.js`：预计算逐年/逐线路渐进绘制计划（边排序、BFS、累计进度标记、站点揭示触发点）；提供 `buildTimelineAnimationPlan`（基于 `openingYear`）与 `buildPseudoTimelineAnimationPlan`（基于 `project.lines` 数组顺序的伪发展史）。
  - `timelinePreviewRenderer.js`：Canvas 2D 实时播放引擎（状态机、瓦片底图、叠加层）。采用连续绘制模式：将所有年份的线段展平为全局 0→1 进度，从第一站一路画到最后一站，相机固定在全网络范围。支持 `pseudoMode` 切换伪线序预览。瓦片异步加载完成后自动触发重绘。
  - `timelineCanvasRenderer.js`：Canvas 绘制原语（边/站点/叠加层）。叠加层包括：顶部横幅（线路色条+线路名开通运营+增量km+英文副标题）、左侧大年份、左侧统计药丸（KM/ST.）、右下线路图例（累计各线路色点+名称+km）、比例尺、OSM 归属。
  - `timelineTileRenderer.js`：OSM 瓦片缓存与渲染（分数 zoom 对齐、`onTileLoaded` 回调、并发控制）。
