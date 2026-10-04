# EAC 市场 × Mojobox 供货目录接口要求 v1

日期：2026-10-04
状态：草案（供双方确认）
适用方：Mojobox（供货方） / EAC 插件市场（收货方）
本文件约定：Mojobox 向 EAC 市场供应内容时，必须提供的数据类型、字段、端点和规则。

---

## 0. 一句话说明

> EAC 市场向 Mojobox 开放 6 类货的供货通道；Mojobox 只需按本文件把每条记录填好、发布在一个固定 HTTPS JSON 地址上；EAC 市场负责展示策划、安全校验和安装执行。

## 1. 货的类型（共 6 类，全部接受）

| 类型代码 | 类型 | 说明 | 落 EAC 市场哪个区 |
| --- | --- | --- | --- |
| `plugin` | 功能插件 | 安装后增加功能的普通插件 | 规则发现 / 全部插件 |
| `skin` | 皮肤 / 外观 | 改变界面外观的皮肤、主题 | 皮肤推荐 / 皮肤中心 |
| `skill` | Skill 技能包 | skill 类内容 | 高分 skill（当前无货，契约留门） |
| `function-pack` | 功能整合包 | 一次安装一组功能插件的套餐 | 套餐区 |
| `appearance-pack` | 外观整合包 | 皮肤/主题组合套餐 | 套餐区 |
| `material` | 资料包 | **不可安装**、仅供浏览参考的内容（如皮肤 Prompt 资料） | 待研究列表 |

> `material` 类型天生不可安装：它不需要下载地址和 SHA-256，也永远不会触发安装动作。

## 2. 责任边界（双方共识，写死不改）

| 事项 | 负责方 |
| --- | --- |
| 货从哪来、版本、指纹、下载地址、上游来源、兼容声明 | **Mojobox（供）** |
| 展示文案润色、用途分类、精选推荐、评分 | **EAC 市场（做）** |
| 真正执行安装、启用、写入用户环境 | **官方插件安装器** |
| "验证通过 verified" 状态的最终判定 | **EAC 市场实机验收后标注** |
| 插件安装后能否正常运行 | **上游插件作者 + 官方安装器**，任何一方不得替对方承诺 |

**硬性要求**：Mojobox 的静态检验结果如标注运行状态，必须如实写 `not-tested`（未做运行测试），不得暗示"已测试可用"。

## 3. 供货端点约定

1. Mojobox 提供**一个固定的 HTTPS JSON 地址**作为供货端点（不带账号密码、不带锚点）；
2. 响应为 UTF-8 JSON，顶层结构：

```json
{
  "schemaVersion": "supply.eac/v1",
  "generatedAt": "2026-10-04T08:00:00Z",
  "revision": "2026-10-04.1",
  "items": []
}
```

| 字段 | 要求 |
| --- | --- |
| `schemaVersion` | 固定为 `supply.eac/v1`；**将来改格式必须提前通知并保留旧版至少一个版本周期** |
| `generatedAt` | 本次生成时间（ISO 8601） |
| `revision` | 本次目录版本号，每次发布必须变化且不可复用 |
| `items` | 下述 6 类货的记录数组 |

3. 每次正式发布时，Mojobox 需同时公布：**本次发布的 commit 号 + 整个 JSON 文件的 SHA-256**（供 EAC 市场核对）；
4. 建议使用 GitHub Pages 固定地址日常拉取，并在发版信息中附带对应的固定提交链接作为存档。

## 4. 公共 7 字段（所有可安装类型必须填）

以下字段适用于 `plugin`、`skin`、`skill`、`function-pack`、`appearance-pack`：

| # | 字段 | 必填 | 规则 | 例子 |
| --- | --- | --- | --- | --- |
| 1 | `packageName` | ✅ | 稳定唯一标识；插件用 npm 包名，套餐用套餐 ID | `dsh-better-sidebar` / `dev.dsh-eac.essentials` |
| 2 | `version` | ✅ | 精确版本号，**禁止写 `latest`、`*`、范围** | `0.12.2` |
| 3 | `downloadUrl` | ✅ | **单件可直接下载的 HTTPS 直链**（插件为 `.tgz`）；套餐见第 5 节 | `https://registry.npmjs.org/.../dsh-better-sidebar-0.12.2.tgz` |
| 4 | `sha256` | ✅ | 文件指纹，64 位小写十六进制，可带 `sha256:` 前缀；**下载文件必须与它逐字节一致** | `5f80d9cfd7f250...` |
| 5 | `requiresDsh` | ✅ | 宿主版本要求，用区间表达 | `>=0.2.0-rc.1 <0.3.0` |
| 6 | `source` | ✅ | 上游原项目地址 + 锁定版本（仓库/目录 + revision），出事必须能顺着它追到源头 | `https://github.com/omdsh-dev/DSH-better-sidebar/tree/0.12.2` |
| 7 | `status` | ✅ | `active`（正常供货）或 `withdrawn`（撤回，见第 7 节） | `active` |

**说明**：插件的名称、作者、许可证、README 等会随 `.tgz` 一起分发，EAC 市场可从包内自动读取，**Mojobox 不需要重复填写**。

## 5. 各类型的追加要求

### 5.1 `plugin`（功能插件）、`skill`（技能包）

- 无追加字段，填满第 4 节 7 个字段即可供货。
- `skill` 当前 EAC 市场暂无现货需求，收到即可上架。

### 5.2 `skin`（皮肤 / 外观）—— 在 7 字段基础上追加 4 项

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `loader` | ✅ | 皮肤加载器名称（及版本，如有） |
| `skinId` | ✅ | 皮肤在加载器中的注册 ID |
| `conflicts` | ✅ | **已知冲突清单**（与哪些皮肤/插件不能同时启用）；无冲突填空数组 `[]`，不得省略字段 |
| `previews` | ✅ | 预览图直链数组，建议锁定到固定 revision 的地址，明暗主题各一张 |

### 5.3 `function-pack` / `appearance-pack`（整合包 / 套餐）

套餐不是单个文件，而是"组件清单 + 执行关系"：

```json
{
  "packageName": "dev.dsh-eac.essentials",
  "version": "0.1.0",
  "requiresDsh": ">=0.2.0-rc.2",
  "source": "https://github.com/DSH-EAC/dsh-mojobox",
  "status": "active",
  "components": [
    {
      "packageName": "dsh-better-sidebar",
      "version": "0.12.2",
      "downloadUrl": "https://registry.npmjs.org/.../dsh-better-sidebar-0.12.2.tgz",
      "sha256": "5f80d9cfd7f250...",
      "required": true
    }
  ],
  "execution": {
    "coverage": "complete",
    "edges": [
      { "prerequisiteId": "dsh-context", "consumerId": "dsh-better-sidebar", "milestone": "installed" }
    ]
  }
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `components[]` | ✅ | 每个组件都要有独立的 `packageName`、`version`、`downloadUrl`、`sha256`、`required`（是否必装）。**不接受只有薄包清单、没有组件直链的供货** |
| `execution.coverage` | ✅ | `complete` / `partial` / `unknown`。**只有 `complete` 时 EAC 市场才开放"一键安装"** |
| `execution.edges[]` | coverage 为 `complete` 时必填 | 组件执行关系：`prerequisiteId`（前置组件）、`consumerId`（依赖组件）、`milestone`（`installed` 先装完 / `active` 先启用）。**该关系必须来自真实核对，禁止从组件清单臆造** |

- `coverage` 非 `complete` 的套餐**仍可供货**，EAC 市场会照常展示，但按钮显示"依赖关系整理中，暂不可一键安装"。
- 套餐的 `appearance` 类型建议另附 `previews` 预览图（同皮肤规则）。

### 5.4 `material`（资料包，不可安装）

只需 4 个字段，**最轻量**：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `packageName` | ✅ | 资料唯一 ID |
| `name` | ✅ | 展示名称 |
| `summary` | ✅ | 一句话说明"这是什么" |
| `source` | ✅ | 资料所在地址 |

- 不需要 `downloadUrl`、`sha256`、`requiresDsh`；
- 必须带 `"installable": false` 标记，EAC 市场只展示、绝不触发安装。

## 6. 完整正例（每类一条）

```json
{
  "schemaVersion": "supply.eac/v1",
  "generatedAt": "2026-10-04T08:00:00Z",
  "revision": "2026-10-04.1",
  "items": [
    {
      "type": "plugin",
      "packageName": "dsh-better-sidebar",
      "version": "0.12.2",
      "downloadUrl": "https://registry.npmjs.org/dsh-better-sidebar/-/dsh-better-sidebar-0.12.2.tgz",
      "sha256": "sha256:5f80d9cfd7f250a675cf9bc7f951ca246c047f09607200831733f845c8255d0f",
      "requiresDsh": ">=0.2.0-rc.1 <0.3.0",
      "source": "https://github.com/omdsh-dev/DSH-better-sidebar/tree/0.12.2",
      "status": "active"
    },
    {
      "type": "skin",
      "packageName": "dsh-bloom-theme",
      "version": "0.16.0",
      "downloadUrl": "https://registry.npmjs.org/dsh-bloom-theme/-/dsh-bloom-theme-0.16.0.tgz",
      "sha256": "9c2f11aa77bb0d3e0d5a6b5f0f3a1c1e7a2b3c4d5e6f708192a3b4c5d6e7f801",
      "requiresDsh": ">=0.2.0-rc.1",
      "source": "https://github.com/webkubor/dsh-bloom-theme/tree/0.16.0",
      "status": "active",
      "loader": "dsh-skin-loader",
      "skinId": "bloom",
      "conflicts": [],
      "previews": [
        "https://raw.githubusercontent.com/webkubor/dsh-bloom-theme/0.16.0/preview/light.png",
        "https://raw.githubusercontent.com/webkubor/dsh-bloom-theme/0.16.0/preview/dark.png"
      ]
    },
    {
      "type": "function-pack",
      "packageName": "dev.dsh-eac.essentials",
      "version": "0.1.0",
      "requiresDsh": ">=0.2.0-rc.2",
      "source": "https://github.com/DSH-EAC/dsh-mojobox/tree/main",
      "status": "active",
      "components": [
        {
          "packageName": "dsh-context",
          "version": "0.62.3",
          "downloadUrl": "https://registry.npmjs.org/dsh-context/-/dsh-context-0.62.3.tgz",
          "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "required": true
        }
      ],
      "execution": { "coverage": "complete", "edges": [] }
    },
    {
      "type": "material",
      "packageName": "skin-prompt-blue-fantasy",
      "name": "蓝色幻想 · 皮肤 Prompt 资料",
      "summary": "根据 EAC/AIO 蓝色幻想皮肤整理的 AI 创作与复刻说明，不可安装。",
      "source": "https://github.com/DSH-EAC/dsh-skin-prompt-packages/tree/bcb2ecaf318f60df2ff86e5214d646a785ccabc9/blue-fantasy",
      "installable": false,
      "status": "active"
    }
  ]
}
```

## 7. 更新与撤回规则

1. **撤回 = 把 `status` 改成 `withdrawn`，记录必须保留**；
2. **严禁直接删除记录**——直接删除会让收货方无法区分"已撤回"和"还没供"，按无效供货处理；
3. 撤回时 `revision` 必须更新，且建议附一句撤回原因（可放 `withdrawnReason` 字段）；
4. EAC 市场每次刷新都会核对 `revision`，发现撤回立即在市场内下架对应条目；
5. 同一 `packageName + version` 的 `downloadUrl` 指纹**不得原地更换字节**；确需换包，必须升版本号。

## 8. 反例（出现任意一条即拒收）

| 反例 | 为什么拒收 |
| --- | --- |
| `"version": "latest"` | 版本不确定，无法核对指纹 |
| 缺 `sha256`，或指纹与文件不符 | 无法验证文件未被篡改 |
| `downloadUrl` 是 HTML 页面地址而不是文件直链 | 安装器无法下载 |
| `conflicts` 字段省略不写 | 皮肤冲突信息缺失会害用户 |
| 发现有毒后直接删除记录 | 收货方无法感知撤回 |
| `"requiresDsh": "0.2.0-rc.2"` 只给单点、不给区间 | 宿主小版本一变就误判；**应给区间**（双方如需精确匹配另行约定） |
| `execution.coverage` 声称 `complete` 但 `edges` 为空或臆造 | 会导致一键安装装出半成品套餐 |
| 运行状态写成 `verified` 但无具体宿主/版本/测试环境证据 | 静态检验不能冒充运行证据 |

## 9. 一期 / 二期安排

| 阶段 | 供货范围 | 说明 |
| --- | --- | --- |
| 一期 | `plugin`、`skin`、`skill`、`material` 4 类 | 7 字段 + 皮肤 4 项，尽快开张 |
| 一期（展示） | `function-pack`、`appearance-pack` | 先供组件清单，`coverage` 可为 `partial`/`unknown`，市场照常展示 |
| 二期 | 套餐 `execution.edges` 补齐 | 补齐并通过 EAC 核对后，套餐区开放一键安装 |

> 这不代表套餐可以无限期延后：每次发布时请在 `revision` 说明中标注依赖执行图的整理进度。

## 10. 不需要 Mojobox 供的东西（避免多做）

- 展示名之外的详情文案、用途分类、精选推荐、评分（EAC 自己策划）；
- 安装、启用、卸载的执行（官方安装器负责）；
- "验证通过"状态判定（EAC 实机验收后标注）；
- 用户本地环境的任何信息（EAC 绝不要求也不接受此类数据）。

## 11. 待 Mojobox 回答的三个问题

1. 你们现有整合包标注要求宿主 `0.2.0-rc.2`，EAC 当前验收目标为 `0.2.0-rc.1`：**能否按第 4 节改为版本区间，并明确 rc.1 是否受支持**？
2. 套餐的组件依赖执行图（`execution.edges`）由谁核对提供？预计何时能补到 `coverage: complete`？
3. `items` 中的 `plugin` 类记录目前线上端点为空（发布门禁未放行）：**预计何时开放**？

---

修订记录：
- v1（2026-10-04）：初稿。范围为 6 类货、公共 7 字段、端点与撤回规则、正反例。
