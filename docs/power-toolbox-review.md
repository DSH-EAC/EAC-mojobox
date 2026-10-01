# DSH Power Toolbox 收录审查

> 审查时间：2026-10-01
>
> 本文记录整合包的组件选择和静态收录边界。Mojobox 不安装、执行或运行验证这些插件。

## 包定位

`dev.dsh-eac.power-toolbox@0.1.0` 是面向 DSH Web 的功能整合包，目标宿主为
`@deepseek-ai/dsh@0.2.0-rc.2`。它是薄 Feature Pack：归档只含根 `pack.json`，插件代码和
插件依赖仍由各上游作者发布。

## 收录组件

| 组件 | 版本 | 作用 | 外部前置条件 |
| --- | --- | --- | --- |
| `dshmarket` | `1.66.7` | 插件市场、搜索和安装入口 | 宿主的插件安装能力 |
| `dsh-better-sidebar` | `0.24.1` | 文件树、编辑器、变更和侧栏扩展 | Node `>=20`；会接管文件侧栏 |
| `dsh-context` | `0.62.2` | 上下文观测和管理 | Node `22.19+` 或 `24+` |
| `@nanmicoder/dsh-agent-teams` | `0.1.22` | 多 Agent 团队、任务依赖和树状监控 | Node `22.19+` 或 `24+` |
| `@wxg-prc-cpg/browser-skill-dsh-plugin` | `0.3.2` | BrowserSkill 浏览器自动化工具 | `bsk` CLI，以及 Chrome/Edge 扩展和浏览器权限 |
| `dsh-vision-router` | `2.3.0` | 视觉路由、OCR、像素工具和截图分析 | Node `22.19+` 或 `24+`；默认视觉链会向远端发送图像，可切换 local-only |
| `github:00080000/dsh-project-memory` | `0.5.13` | 项目文档索引、引用记忆和经验检索 | Node `>=18`；首次使用需建立项目索引 |

所有版本均为 2026-10-01 从 npm `latest` 读取的精确版本。组件来源和许可证以各自 npm
元数据及 GitHub 仓库为准；本包许可证只覆盖本包清单，不重新许可上游插件。项目记忆包的
npm `gitHead` 为 `0886e2e2b914e971feef646cab08f51b43265fba`，但 Feature Pack v1 的
`github:` 引用不能携带 commit，因此这里的 `0.5.13` 是版本声明，不是归档内的来源锁定。

## 取舍和缺口

- `dsh-vision-router` 取代 ModLens。ModLens 依赖外部 Antigravity/Codex/OpenCode/Pi 等视觉
  CLI，Vision Router 已声明支持 DSH `0.2.0-rc.2`，并提供本地像素工具和可选免费视觉链。
- `dsh-find-plugin` 暂不加入。它的发现能力与 `dshmarket` 重叠，且当前 peer 声明最多覆盖
  DSH `0.1.7`，不适合作为本包的默认组件。
- `dsh-at-file` 暂不加入。上游已经说明 DSH 官方版本内置 `@file` 和 `@session` 引用。
- `dsh-im` 暂不加入。它会接入微信、飞书、钉钉、QQ、Slack、Discord 等通信渠道，需要大量
  外部凭据和长期运行服务，属于可选通信包，不应默认扩大工具箱权限。
- `dsh-browser` 暂不加入。它是带完整 DSH `0.2.0-rc.1` 运行时和浏览器扩展的独立工作区，
  不是与 BrowserSkill 等价的单一插件；本包保留可由 DSH 插件直接安装的 BrowserSkill 入口。
- `dsh-vision-toolkit` 暂不加入。它仍声明 DSH `<0.2.0` 兼容范围；后续发布覆盖目标宿主并
  明确外部服务边界后再评估替换 Vision Router。

当前明显缺失的是通信通知和更深的代码索引能力，但它们分别会引入凭据、外部服务或较高的
运行成本，先作为后续候选记录，不阻塞首版工具箱收录。

## 流程复盘

本次流程已经能从候选清单生成薄包、计算真实摘要、运行收录检查并生成下载目录，但仍有三处
可以优化：

1. 在生成归档前先跑插件引用语法预检，避免 npm scope 含下划线时到最后一步才发现检查器限制。
2. 把 npm `gitHead`、dist integrity 和 GitHub repository 一并保存为组件来源快照，减少只靠版本
   字符串追溯上游的歧义。
3. 将静态收录、宿主安装和运行验证拆成三个明确状态；当前首版只完成第一层，后续再用隔离
   Profile 验证实际安装，不把 Feature Pack 的版本字段当成宿主已经锁定依赖。

## 检查边界

通过 Mojobox 检查只表示：Feature Pack v1 清单符合 Schema、ZIP 布局受限、摘要和收录记录
一致。当前记录仍为 `runtime: not-tested`、`references: not-resolved`；不表示插件来源在线、
依赖已经安装、浏览器扩展已授权或任何宿主运行兼容性。
