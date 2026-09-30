# 社区皮肤元数据候选

本次贡献保留五组社区皮肤的原始来源资料，并为其中具有 Cordis 插件入口的
项目提供六条 legacy Plugin Catalog 记录。它们用于来源审阅，不进入当前
`catalog/feature-packs/` 正式收录或默认网站。当前 MVP 的公开外观包仍然暂缓。

## 原始数据

`community-metadata.json` 原样来自
[dsh-skin-prompt-packages](https://github.com/DSH-EAC/dsh-skin-prompt-packages/blob/51acecd8707a6cc1f71e69fc2566a36f317024df/skin-prompts/community-metadata.json)，
字节保持不变，SHA-256 为：

```text
d5c5852efbe97ebb5b2b2102c1b3ec2c02ad540f7f086443e44ff6e8e93a0e03
```

该文件中的安装状态和调查说明是来源快照，后续的 artifact 下载核验记录见下表。
`beauty-skins.json` 保留美女系列的完整来源记录；源码覆盖项目没有根插件清单或
可核验的 Host 入口，因此没有为它创建 Plugin Manifest、版本或 artifact。

## 目录映射与来源

| 来源 | Catalog ID | 版本 | artifact 核验 |
| --- | --- | --- | --- |
| 鲸鱼娘系列管理器 | `dev.smalltailqwq.whale-manager` | `0.1.6` | 精确 npm tarball，实测 SHA-256 |
| 深海女仆工坊 | `dev.smalltailqwq.maid-atelier` | `0.1.7` | 精确 npm tarball，实测 SHA-256 |
| 虎鲸链路 | `dev.smalltailqwq.orca-link` | `0.1.7` | 精确 npm tarball，实测 SHA-256 |
| 滑动变阻器 | `dev.kingofsoysauce.liang-skin` | `0.1.7` | GitHub Release asset 523160379，实测 SHA-256 |
| 鲸鱼娘昼夜工坊 | `dev.ggbond2424648901.deep-whale-day-night` | `0.1.12` | GitHub Release asset 520503316，实测 SHA-256 |
| 终末地官网风格 | `dev.ymh0000123.theme-endfield` | `1.1.5` | 固定 Git 源码；无已核验精确 artifact，标记 `unpublished` |
| 美女系列 | 无 Plugin Manifest | 无插件版本声明 | 源码覆盖项目，仅保留候选来源 |

六条记录位于 `../../catalog/plugins/`，文件名与 Catalog ID 对应。
全部使用 `registry-maintained`，不是作者发布的 dsh-std Manifest。
Host entry 来自真实包入口；`v1alpha1` 沿用现有目录约定，不代表运行时协商通过。

`package-snapshots/` 保存各条记录使用的 package.json：三个 npm 原始产物、
两个 GitHub Release 原始产物，以及终末地固定 Git commit 的源码元数据。
记录的 `packageSnapshotDigest` 按这些快照原始字节计算。
只有五个已实际下载且摘要核验的产物投影 `x-mojobox-package`。
GitHub 发布产物与固定 Git 源码分别记录，不推断二者相同。
下载和读取过程中没有运行插件、安装脚本或生命周期脚本。

## 后续 Feature Pack 与注入器适配

皮肤注入器的外部来源继续记录在原始元数据的 `skinLoader` 中：
[dsh-ui-skin-loader](https://github.com/DSH-EAC/dsh-ui-skin-loader)。
当前主线没有对应 loader Catalog 记录，本次不将外部来源描述成已经收录或集成。

待外观包开放后，由开发者提供符合 [收录规范](../../docs/intake.md) 的薄
Feature Pack v1 原始归档，再提交收录记录和真实归档摘要。新格式接受 npm、GitHub
和 builtin 引用，静态收录不要求预先解析这些引用；legacy PackLock 的精确 npm
限制不适用于它。本次只贡献来源元数据，不组合运行时或生成安装包。

实际安装还需要开发者核对以下事实：

- 美女系列需要可被宿主解析的独立插件来源；源码覆盖目录不能当作插件引用。
- 鲸鱼娘原版与昼夜工坊存在同名 skin id/bodyAttr，不能据此承诺同时激活可用。
- 原版皮肤与官方注入器的注册接口尚未验证。
- 终末地精确版本的可安装产物尚未核验。
- 所有插件的宿主安装、重启及运行验证均未执行，没有签发生产 Evidence。

## 许可

包、壁纸、美术、游戏素材及人物素材的权利归对应作者或权利人。
鲸鱼相关美术的非商业和相同方式共享要求继续有效；滑动变阻器标记
`NOASSERTION`，不据此推断再分发授权。终末地代码的 MIT 不覆盖游戏素材权利。
本贡献只收录元数据及 package.json 快照，不包含皮肤代码或美术载荷。
