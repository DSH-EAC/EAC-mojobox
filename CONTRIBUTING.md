# Contributing to DSH Mojobox

本文面向提交 Pull Request 的维护者。第一次了解项目请先读 [README](README.md)，涉及边界或
Host Adapter 时再读[架构说明](docs/architecture.md)。使用 coding agent 时先让它读取
[AGENTS.md](AGENTS.md)。

当前 MVP 的目标是功能整合包目录和宿主市场一键安装。正式安装格式采用宿主 Feature Pack v1；
旧 Mojobox Pack/Lock/归档链路只做 legacy 维护。开始新任务前先读
[MVP 开发文档](docs/mvp-development.md)，不要新增格式桥接或 EAC 专属安装逻辑。

## 1. 开发环境

要求 Node.js 22.12 或更新的受支持版本。

```bash
npm ci
npm test
```

使用独立任务分支。提交采用 Conventional Commits：

```text
feat(catalog): 添加 example 插件记录
fix(pack): 修正 focus-kit 的 artifact 摘要
docs: 完善 Host Adapter 接入说明
```

## 2. 改动流程

### 插件记录

1. 在 `catalog/plugins/<stable-id>.json` 添加或更新记录。
2. 优先采用作者 Manifest；目录代维护记录使用 `registry-maintained`。
3. 只填写可从源码、包元数据或上游文档核验的事实。
4. 已发布 artifact 使用精确版本、固定 URL 和真实 SHA-256。
5. 未发布记录标记 `unpublished`，不加入 Pack Lock。
6. artifact 存在 `package.json.dsh` 时可投影为 `x-mojobox-package`；没有的字段不推断。
7. 运行 `npm test`。

Manifest 任意字节变化都会改变 `manifestDigest`。重新生成引用它的 Lock，不要仅为格式统一
重排已有 JSON。历史 Evidence 不改写；发布新版本并真实验证后新增记录。

### Pack 与 Pack Lock

> 本节描述 legacy Mojobox Pack/Lock。MVP 正式功能包应按 Feature Pack v1 准备归档，并生成
> 宿主使用的 `packs-index.json`；具体验收见 [MVP 开发文档](docs/mvp-development.md)。

作者维护 Pack，工具生成对应 Lock：

```text
catalog/packs/<id>.pack.json
catalog/packs/<id>.lock.json
```

确认 Pack ID/版本、组件集合、组件版本完全对应；Lock 使用精确 npm 来源，并记录真实
`manifestDigest` 与 `artifactDigest`。插件型 Pack 可选分类为 `function`、`appearance` 或
`workflow`；分类不改变安装语义。Profile/Preset 和完整环境不得放入 Pack。完成后运行
以下命令：

```bash
npm run lock:pack -- catalog/packs/<id>.pack.json
npm test
npm run build
```

锁定命令不联网、不升级组件；artifact 摘要由已审阅目录提供，实际下载字节由构建校验。
构建后可用 `npm run inspect:pack -- <下载文件.dshpack>` 独立检查归档；PR 和发布工作流也会
检查生成的每个下载包。读取器核对格式、对象引用及摘要，不执行组件。
文件名必须与 ID 对应，组件不能重复。当前每个稳定 ID 只保存一个版本，不原地替换已经发布
版本的内容。发布历史由版本发布保留。

`distribution.json` 是公开分发范围的唯一配置，当前仅发布 `function`。外观包资料继续校验，
不生成公开下载；未分类包也不会默认发布。例子见 [格式说明](docs/pack-format.md)。

### Evidence

Evidence 必须记录真实执行结果，并绑定：

- subject ID、版本、artifact digest 与 Manifest digest；
- issuer、Host、Adapter、DSH 和 runtime；
- suite ID、版本与 digest；
- 协议 revision；
- checks、时间、有效期和撤回状态。

fixture 只测试协议形状，不计为生产 Evidence。不同宿主必须独立记录 issuer、Host Descriptor
和适用范围。

在 `evidence-suites.json` 登记实际执行的 suite ID、版本、摘要和固定 commit 源码链接。不能
通过改写旧记录来让新 validator 通过；该登记表仅固定历史输入，不自动证明测试已经执行。

### Schema 或 Validator

协议变化至少包含：

- 一个 `fixtures/valid/` 正例；
- 一个 `fixtures/invalid/` 反例；
- 必要的跨文件语义校验；
- PR 中的兼容影响、迁移和回退说明。

不要为单条目录数据放宽公共 Schema，也不要让 Validator 访问网络或执行插件。

### Static Web

网站保持无后端，并且只消费生成的 Catalog。不要手工编辑生成目录。

```bash
npm run dev
npm run build
BASE_PATH=/dsh-mojobox/ npm run build
npm run preview
```

UI 变化至少检查桌面/窄屏、键盘焦点、空结果、数据加载失败和下载失败。

### 上游协议

`spec-revisions.json` 只记录完整 commit，并区分现行坐标与 `legacyTuiAdmission` 等历史输入。
升级时同步 vendored Schema、许可证、profiles、fixtures 和新 Evidence。未经重新运行 suite，
不得改写历史 Evidence 的 revision。

官方 Package Manifest 类型来自固定的 `officialHarness` revision。该投影用于目录事实和后续
兼容计划，不得描述成官方 installer 已强制验证。

## 3. 最低验证

| 改动 | 最低验证 |
| --- | --- |
| README / docs / PR template | `npm test`、链接检查、`git diff --check` |
| Catalog / Pack / Evidence | `npm test`、`npm run build` |
| Schema / fixtures / validator | `npm test`、`npm run build`，含正反例 |
| Site UI | `npm test`、根路径与 `BASE_PATH=/dsh-mojobox/` 构建、人工交互检查 |
| `.dshpack` 生成 | `npm test`、两次构建摘要对比、归档内容检查 |

## 4. 提交前检查

```bash
npm test
npm run build
git diff --check
git status --short
```

不得提交：

- `node_modules/`、`.cache/`、`dist/`、`site/public/generated/`；
- token、cookie、凭据、用户数据或本机绝对路径；
- 与任务无关的格式化、依赖升级或生成文件；
- 未经验证的摘要和浮动版本。

## 5. Pull Request

PR 标题和说明使用中文。正文说明：

- 改动目的与用户可见结果；
- 受影响的协议对象和事实源；
- 兼容性、摘要与 Evidence 影响；
- 实际执行的验证及结果；
- 未验证项；
- 回退方式。

不要把“Schema 通过”“fixture 通过”描述成生产宿主兼容或安全认证。
