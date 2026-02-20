### 版本管理

- 使用 Semantic Versioning（SemVer）：`MAJOR.MINOR.PATCH`（如 `0.27.0`）。
- 版本号递增规则：
  - `MAJOR`：不兼容的 API 变更（破坏性改动）。
  - `MINOR`：向后兼容的功能性变更（新增功能）。
  - `PATCH`：向后兼容的问题修复、改进、重构。

请你：
- 根据 `git diff` 内容分析变更类型并决定版本号递增级别。
- 代码合并到 `main` 分支后自动更新 `package.json` 版本号。
- 同步更新 `CHANGELOG.md`，记录详细变更。