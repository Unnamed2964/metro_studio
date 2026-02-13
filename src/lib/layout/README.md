# lib/layout 目录说明

布局模块（主线程侧），负责与 Web Worker 通信。

- `workerClient.js`
  - 懒加载创建 Worker 实例
  - 维护请求队列（`requestId -> Promise`）
  - 暴露 `optimizeLayoutInWorker(payload)` 供 Store 调用

说明：

- 真正的优化算法实现位于 `src/workers/layoutWorker.js`。
- Worker 当前包含线路级方向规划与八向硬约束，主线程侧仅透传 `stations/edges/lines`。
