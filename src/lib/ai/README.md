# lib/ai 目录说明

该目录封装 AI 能力调用。

- `stationNaming.js`
  - 两阶段生成：第一阶段生成中文站名，第二阶段将中文站名翻译为英文
  - 调用 BLTCY 兼容 Chat Completions（默认模型 `gemini-3-flash-preview`）
  - 从环境变量读取 API Key：`BLTCY_API_KEY` / `VITE_BLTCY_API_KEY`，并兼容 `LLM_API_KEY` / `VITE_LLM_API_KEY`
  - 第一阶段：将周边 OSM 要素（道路交叉口/道路/地域/设施/建筑）转为自然语言描述，由模型直接选择最合适的一个中文站名
  - 第二阶段：将中文站名独立翻译为英文，遵循拼音+意译规范
  - 代码端硬过滤居住区名称（如"小区/社区/家园/花园/公寓"等）
  - 中文站名统一去除末尾"站/车站/地铁站"
  - 英文站名禁止以 `Station/Metro Station/Subway Station` 结尾
  - 道路专名中的方位词保留拼音写法（如 `Erhuan Nanlu`、`Shanshi Donglu`）
  - 公共机构英文意译通名，禁止整词音译
  - 每个站点只生成一个最优命名结果（不再返回多候选列表）
  - 支持多站点批量接口 `generateStationNameCandidatesBatch`（批量中文 + 逐个翻译英文）
- `stationEnTranslator.js`
  - 分批重译全图英文站名，输出进度回调（`done/total/percent`）
  - 使用 `response_format(json_schema)` 降低批量翻译格式漂移
  - 翻译输入前先去除中文名末尾“站/车站/地铁站”
  - 道路专名中的方位词按拼音保留，不强制译为 `South/East/West/North`
  - 翻译结果统一清洗英文后缀，禁止 `Station/Metro Station/Subway Station`
  - 公共机构名称按英文语义意译（如 `妇幼保健院 -> Maternal and Child Health Hospital`）
- `openrouterClient.js`
  - 统一 Chat Completions 请求（函数导出名为 `postLLMChat`，默认 `https://api.bltcy.ai/v1/chat/completions`，超时/取消/鉴权/错误处理）

约束：

- 命名候选必须基于输入上下文，不允许虚构周边地名或设施名。
