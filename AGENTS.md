## 开发规范

### 版本管理

- 使用 Semantic Versioning (SemVer) 规范：MAJOR.MINOR.PATCH（如 0.27.0）
- 版本号递增规则：
  - **MAOR**：不兼容的 API 变更（破坏性改动）
  - **MINOR**：向后兼容的功能性变更（新增功能）
  - **PATCH**：向后兼容的问题修复、改进、重构
- 每 2-4 个提交聚合为一个版本发布
- 根据 git diff 内容分析变更类型，决定版本号递增级别
- 代码合并到 main 分支后自动更新 package.json 版本号
- 同步更新 CHANGELOG.md，记录详细的变更内容

### 代码质量

- 不 mock，不简化实现，不做"先跑起来再说"的妥协。禁止 MVP 思维。
- 不做假设，不确定的地方询问用户。
- 使用频繁更新的库时，先搜索互联网获取最新 API 文档。
- 代码变更必须同步更新对应目录的 README.md，保证文档与实现一致。
- 过长文件分块写入。

### 用户体验原则

- 用户体验是最高优先级的技术决策依据。
- 交互要直觉化——用户不应该需要看说明书才能上手。
- 视觉反馈要即时——每个操作都应该有清晰的响应。
- 错误处理要优雅——不让用户看到技术性的错误信息，给出可操作的提示。
- 性能是体验的一部分——卡顿就是 bug。 

Add under a ## Bug Fixing section at the top level of CLAUDE.md\n\nWhen fixing bugs, always ask clarifying questions about the exact UI element or behavior before making changes. Do not assume which component, icon, or element the user is referring to.
Add under a ## Workflow section near the top of CLAUDE.md\n\nBefore implementing a solution, briefly present the approach and get user confirmation. Never start large refactors, feature implementations, or multi-file changes without stating the plan first.
Add under a ## Project Context section at the top of CLAUDE.md\n\nThis is a Vue.js + JavaScript project using canvas rendering and map libraries (MapLibre/Protomaps). When editing map-related code, pay close attention to field names in tile schemas (e.g., 'kind' vs 'class') and distinguish between DOM events and map library events.
Add under a ## Writing Style section in CLAUDE.md\n\nKeep tone professional and minimal in user-facing text (release notes, READMEs, docs). No emojis. No hype language. Match the user's communication style, which is direct and technical.
Add under a ## Technical Constraints section in CLAUDE.md\n\nWhen writing or editing large files (>200 lines), use chunked writes. Never attempt to write an entire large file in one operation.