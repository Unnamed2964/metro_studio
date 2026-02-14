# lib/ai 目录说明

该目录封装 AI 能力调用。

- `stationNaming.js`
  - 调用 BLTCY 兼容 Chat Completions（默认模型 `claude-haiku-4-5-20251001`）
  - 从环境变量读取 `BLTCY_API_KEY`（同时兼容 `VITE_BLTCY_API_KEY`）
  - 向模型提交结构化命名约束与证据列表（`evidenceId`）
  - 代码端硬过滤居住区证据（如“小区/社区/家园/花园/公寓”等）避免站名落在住宅小区
  - 命名优先级强化为片区名、立交桥、道路交叉口、主干路等导向性要素
  - 中文候选站名统一去除末尾“站/车站/地铁站”
  - 道路专名中的方位词（如“二环南路”“山师东路”）英文不译为 `South/East`，直接保留拼音写法（如 `Erhuan Nanlu`、`Shanshi Donglu`）
  - 英文候选站名禁止以 `Station/Metro Station/Subway Station` 结尾
  - 公共机构（医院/学校/政府机构等）要求英文意译其通名，禁止整词音译
  - 证据列表包含 `intersections`（道路交叉口）并在强交叉口场景启用硬约束：禁止单一道路证据命名
  - 强制解析并校验候选（`evidenceId/nameZh/nameEn/basis/reason`）
  - 代码端执行证据白名单校验：候选 `nameZh` 去后缀后必须落在 `evidenceId` 对应要素上
  - 模型响应不完整时使用周边要素做规则回退，仍不足则报错
- `stationEnTranslator.js`
  - 分批重译全图英文站名，输出进度回调（`done/total/percent`）
  - 使用 `response_format(json_schema)` 降低批量翻译格式漂移
  - 翻译输入前先去除中文名末尾“站/车站/地铁站”
  - 道路专名中的方位词按拼音保留，不强制译为 `South/East/West/North`
  - 翻译结果统一清洗英文后缀，禁止 `Station/Metro Station/Subway Station`
  - 公共机构名称按英文语义意译（如 `妇幼保健院 -> Maternal and Child Health Hospital`）
- `openrouterClient.js`
  - 统一 Chat Completions 请求（默认 `https://api.bltcy.ai/v1/chat/completions`，超时/取消/鉴权/错误处理）

约束：

- 命名候选必须基于输入上下文，不允许虚构周边地名或设施名。
