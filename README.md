# DSH Mojobox

Mojobox 是面向 DeepSeek Harness 生态的功能整合包目录与分发仓库。Mojobox 负责目录、来源、
版本、摘要和市场索引；官方桌面端的 Host 插件负责读取索引并一键安装 Feature Pack。

项目仍处于 `0.1.0-alpha.0`。它不是官方认证市场，也不承诺所有插件可在所有宿主运行；采用方
必须固定本仓库 revision。

## 当前基座

当前 MVP 只发布功能整合包。外观包协议与源资料保留，但不进入公开索引；EAC 专属新协议、UI、
bridge 和安装事务暂时冻结。详细边界见 [MVP 开发文档](docs/mvp-development.md)。

协议基座包括：

| 阶段 | 已实现 | 对团队的意义 |
| --- | --- | --- |
| 1. 上游坐标分离 | 现行 Harness、生态规范、TUI、distribution、EAC 与旧 TUI Evidence 分开固定 | 更新上游不会改写历史证据 |
| 2. 官方包元数据 | 可选读取官方 `package.json.dsh` 字段，并投影为 `x-mojobox-package` | 可逐步接入官方插件声明，不另造插件协议 |
| 3. 通用目录 | 移除插件数和 Pack 数的开发期门槛 | 团队可以持续扩充目录 |
| 4. Pack 分类 | 支持 `function`、`appearance`、`workflow` | 功能包、外观包和工作流包可统一浏览与安装 |

当前工作区保留历史目录数据和 legacy Pack/Lock 链路，后续正式市场内容以宿主 Feature Pack v1
为安装格式，优先收录用户指定的功能整合包。

宿主侧已有 `dsh-unified-market` 与 Feature Pack CLI 原型，但当前最小桌面分发清单仍需重新纳入
Feature Pack 核心文件。浏览器目录第一版只负责浏览和下载；一键安装发生在宿主市场内。

尚未完成的外部验收：首个正式功能包的真实安装、宿主资源重新装配、浏览器视觉检查和静态站部署。
账号服务、Profile/Preset 包、外观包不属于本阶段。
完整环境的身份、布局和迁移属于 `dsh-distribution`，不塞进 Mojobox Pack。

## 对象边界

| 对象 | 回答的问题 | 权威来源/执行方 |
| --- | --- | --- |
| 官方 Package Manifest 投影 | npm 包声明了哪些 DSH、engine、client 字段？ | `deepseek-harness` 的 `package.json.dsh` 类型 |
| `dsh-std` Plugin Manifest | 插件的 facet、权限和运行时契约是什么？ | `dsh-std` |
| Mojobox Pack / Lock | 选择哪些插件，这次精确安装哪些版本和字节？ | Mojobox |
| Evidence | 哪个精确产物在什么宿主和 suite 下验证到哪一级？ | 独立签发方 |
| Host 插件 | 如何读取市场索引、校验并一键安装功能包？ | 官方桌面端 Host 插件 |
| 完整环境 | 整个 DSH 发行环境如何发现和迁移？ | `dsh-distribution` |

官方包元数据只是对 artifact 中已存在字段的投影。它不替代 `dsh-std` Manifest，也不表示官方
installer 当前已经强制检查 `manifestVersion` 或 `engines.dsh`。

## 数据流

```mermaid
flowchart LR
  A[package.json.dsh] --> C[Catalog plugin record]
  B[dsh-std Manifest] --> C
  E[Evidence] --> C
  C --> W[静态网站]
  C --> P[Feature Pack 元数据]
  P --> I[packs-index.json + .dshpack]
  I --> H[官方桌面 Host 插件]
  H --> T[宿主 Feature Pack CLI]
```

Mojobox 网站只浏览和下载，不读取本机环境，也不直接安装。宿主市场读取同一 `packs-index.json`
并负责用户确认、校验和安装。第一版不提供浏览器直接启动桌面客户端的深链接。

## 用户使用

本地运行目录网站：

```bash
npm ci
npm run dev
```

页面可以搜索插件和功能整合包，查看精确版本、来源、归档摘要和宿主兼容范围，并下载
Feature Pack。下载不代表安装兼容；宿主安装结果以目标桌面版本的实际验证为准。

Pack 分类只影响组织和展示，不改变安装算法：

| 分类 | 用途 | 示例 |
| --- | --- | --- |
| `function` | 提供一组功能增强 | AIO 功能包 |
| `appearance` | 主题、导航、壁纸、挂件等外观 | AIO 外观包 |
| `workflow` | 面向某类工作流程的组合 | 编程、文件处理或桌面操作 |

## 团队开发入口

要求 Node.js 22.12 或更新的受支持版本。先创建任务分支，然后：

```bash
git clone https://github.com/DSH-EAC/dsh-mojobox.git
cd dsh-mojobox
npm ci
npm test
```

按任务进入对应事实源：

| 要做什么 | 修改入口 | 完成检查 |
| --- | --- | --- |
| 收录插件 | `catalog/plugins/*.json` | `npm test` |
| 收录功能整合包 | Pack 元数据、真实 `.dshpack` 和 `packs-index.json` | `npm test && npm run build` |
| 记录真实兼容结果 | `catalog/evidence/*.json` | `npm test` |
| 改协议字段 | `schemas/`、正反 `fixtures/`、validator | `npm test && npm run build` |
| 改目录网站 | `site/` | 根路径和仓库子路径构建、桌面与窄屏检查 |
| 宿主一键安装 | 复用官方桌面 Host 插件和 Feature Pack CLI | 资源完整性、隔离 Profile 安装与重启验收 |

详细步骤见[贡献指南](CONTRIBUTING.md)、[架构说明](docs/architecture.md)和
[Agent 开发指南](docs/agent-guide.md)。Coding agent 必须先读 [AGENTS.md](AGENTS.md)。

新增功能包不需要修改网站代码。先准备符合 Feature Pack v1 的归档和索引条目，然后运行：

```bash
npm test
npm run build
```

构建必须校验真实归档字节和 SHA-256。下载归档也可以独立检查：

```bash
npm run inspect:pack -- dist/generated/downloads/dev.aio.function-0.1.0.dshpack
```

检查器只读 ZIP 和锁定对象，不解压到磁盘、不联网、不安装组件。检查通过仅表示归档自洽，
不代表来源可信或插件运行兼容；外部下载还应对照可信目录核对整个归档的 SHA-256。

旧 Mojobox 格式和官方 Feature Pack 格式暂不互转。详见 [MVP 开发文档](docs/mvp-development.md)、
[格式说明](docs/pack-format.md)、[宿主接入](docs/host-adapter.md)、
[部署说明](docs/deployment.md)、[实施进度](docs/implementation-plan.md)和
[本次会话交接文档](docs/handoff.md)。

## 仓库地图

| 路径 | 内容 | 是否事实源 |
| --- | --- | --- |
| `catalog/plugins/` | 插件目录记录 | 是 |
| `catalog/packs/` | Pack 与 Pack Lock | 是 |
| `catalog/evidence/` | 生产 Evidence | 是 |
| `schemas/`、`fixtures/` | Mojobox wire contract 与正反例 | 是 |
| `profiles/` | Host/Profile 快照 | 是 |
| `spec-revisions.json` | 现行上游和历史 Evidence 坐标 | 是 |
| `vendor/dsh-std/` | 固定的 `dsh-std` Schema 与许可证 | 是 |
| `scripts/` | 校验、Catalog 和离线包构建 | 是 |
| `site/` | 静态网站源码 | 是 |
| `site/public/generated/`、`dist/`、`.cache/` | 可重建产物 | 否，不提交 |

## 维护规则

以下 Pack/Lock 摘要规则主要约束 legacy Mojobox 格式；MVP 的正式安装输入是宿主 Feature Pack
v1，收录、索引和验收以 [MVP 开发文档](docs/mvp-development.md) 为准。

- 插件记录优先使用作者声明；目录代维护必须标记 `registry-maintained`。
- `x-mojobox-package` 只能记录 artifact 的真实 `package.json` 字段，不能补造。
- Pack 与 Lock 必须成对；Lock 只接受精确版本、精确 npm source 和真实 SHA-256。
- Manifest 任意字节变化都须重新生成 Lock；历史 Evidence 不改写，实际重新验证后新增记录。
- 新 revision 生成新 Evidence，不修改旧 Evidence 来制造“最新兼容”。
- 旧 TUI admission 只用于有 revision 的历史 fixture，不是当前公共准入门槛。
- Schema 通过只表示结构和引用自洽，不等于安全或运行兼容。

提交前至少运行：

```bash
npm test
npm run build
git diff --check
```

legacy 构建首次可能下载 Lock 指定的 npm tarball；缓存位于 `.cache/artifacts/`。MVP 发布时还
必须对最终 Feature Pack 归档和 `packs-index.json` 做独立 SHA-256 校验。

## 上游坐标

- [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)：官方 Package Manifest 类型与 Desktop 基线。
- [dsh-std](https://github.com/Yan-Zero/dsh-std)：社区插件 Manifest 与运行时契约。
- [dsh-ecosystem-spec](https://github.com/T-Auto/dsh-ecosystem-spec)：生态规范入口。
- [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI)：TUI Adapter 实现；当前尚无新 Profile 接入。
- [dsh-distribution](https://github.com/T-Auto/dsh-distribution)：完整环境协议。
- [DeepSeek Harness EAC](https://github.com/DSH-EAC/DSH-Desktop-EAC)：优先评估的接入宿主。

所有精确 commit 记录在 [`spec-revisions.json`](spec-revisions.json)，不跟随浮动 `main`。

## License

[MIT](LICENSE)
