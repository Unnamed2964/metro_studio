# ranking 子模块说明

- `worldMetroRanking.js`
  - 从 Wikipedia `List of metro systems` 实时拉取全球地铁系统表格（MediaWiki Parse API）
  - 解析 `System length` 字段并输出按里程降序的排行榜（单位 km）
  - 计算当前工程总里程（优先 `edge.lengthMeters`，缺失时回退 `waypoints`/站点坐标球面距离）
  - 计算玩家在全球榜中的名次、前后相邻条目与里程差
