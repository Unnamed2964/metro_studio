# stores/project/actions 目录说明

该目录按职责拆分 `projectStore` actions：

- `lifecycle.js`
  - 工程生命周期（初始化、新建、重命名、复制、删除、按 ID 加载、列表）
- `selection.js`
  - 交互状态（模式、当前线路、站点选择、多选、连续布线选择逻辑；模式含 AI 点站）
  - 支持线段多选状态（`selectedEdgeIds`）与站点/线段同时框选
- `networkEditing.js`
  - 线网编辑（加站、连线、站点/线路更新、锚点编辑、删除、线路归属重算）
  - 新增线路默认自动分配与现有线路差异更大的颜色（未显式指定颜色时生效）
  - 站名支持批量写入（`updateStationNamesBatch`，单次历史落盘，适配大规模 AI 自动命名）
  - 支持按选中线段迁移所属线（可对多选线段生效）
  - 支持线段批量属性编辑（所属线、线型覆盖、曲线/直线切换）
  - 手动换乘关系编辑（两站绑定/解绑为换乘，不改原始线网拓扑）
  - 线路线型写入前统一归一化（支持单线/双线/虚线/点线等样式）
  - 线段分割（`splitEdgeAtPoint`）：在线段指定点插入新站点并分割为两条边，保留原线路分配
  - 线段合并（`mergeEdgesAtStation`）：合并站点处恰好连接的两条同线路边为一条边并删除中间站点
  - 合并校验（`canMergeEdgesAtStation`）：检查站点是否恰好连接两条同线路边，返回布尔值用于UI状态
- `history.js`
  - 编辑历史记录（快照栈、连续编辑合并、撤销/重做）
  - 状态恢复时同步恢复选择态与当前模式
- `importLayout.js`
  - OSM 导入与自动排版触发（导入会新建工程，避免覆盖当前工程）
- `exportPersistence.js`
  - 工程文件导入导出、PNG/HUD 导出、持久化节流、真实地图导出器注册
  - 通过 `touchProject()` 接入历史记录写入
- `timelineActions.js`
  - 时间轴动画相关 action（年份筛选、播放状态、播放速度、事件增删）
  - `setTimelineFilterYear` / `setTimelinePlaybackState` / `setTimelinePlaybackSpeed` 为瞬态 UI 状态，不写历史
  - `addTimelineEvent` / `removeTimelineEvent` 修改项目数据，通过 `touchProject()` 接入历史记录

说明：

- 文件拆分后方法名保持一致，`projectStore.js` 通过对象展开聚合。
