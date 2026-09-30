# 开发者整合包收录规范

本文件是当前收录主线。Mojobox 负责收纳、静态检验、展示和下载；整合包内容、依赖、更新和功能正确性由开发者维护。宿主安装与运行测试是后续独立阶段，不阻塞收录框架开发。

## 当前支持范围

第一版支持 `eac-feature-pack-v1` 薄功能包：ZIP 内必须有根 `pack.json`，可选根 `icon.png`。这是当前支持的输入格式，不是对所有 DSH 宿主兼容的承诺。

- 至少一个插件引用；接受 npm 名、`github:owner/repo` 和 `builtin:目录名`。
- 不解析或下载引用，也不运行插件。
- 不接收 preset、skill、非空 overrides、内嵌插件代码或其他文件；遇到这些输入给出不支持原因，不静默转换。
- 清单上限 1 MiB、图标上限 512 KiB、归档上限 2 MiB；图标检查 PNG 签名，不进行图片解码或安全认证。
- 拒绝重复路径、符号链接、危险路径、加密成员、重复插件引用和明确标记的草稿。
- 这些限制是首版收录策略，不改变 EAC 原始格式的定义。更大或不同格式的包后续按实际需求适配。

## 提交方式

开发者提供现成归档和来源，不要求 Mojobox 重新组合插件。首版采用仓库内保存并随静态站原样托管归档的方式；不自动抓取远端、不改写开发者产物。

1. 将真实产物放入 `artifacts/<id>-<version>.dshpack`。
2. 添加 `catalog/feature-packs/<id>.json`，示例结构如下（摘要必须替换为真实计算值）：

```json
{
  "format": "eac-feature-pack-v1",
  "id": "org.example.tools",
  "version": "1.0.0",
  "source": "https://github.com/example/tools/releases/tag/v1.0.0",
  "author": "Example author",
  "license": "MIT",
  "sha256": "填写实际归档的64位小写十六进制SHA-256"
}
```

`source` 是开发者来源页面，不是安装地址；要求 HTTPS 且不能包含 URL 用户名和密码。作者与许可证需人工核对来源，自动检查只能验证字段及其与清单的一致性，不构成法律核验。一个稳定 ID 当前只收录一个版本，更新时提交新的版本和真实摘要，历史版本由 Git 历史保留。

## 命令

```powershell
npm run inspect:feature-pack -- artifacts/<id>-<version>.dshpack
npm run inspect:feature-pack -- artifacts/<id>-<version>.dshpack <预期sha256>
node scripts/build-catalog.mjs --check
npm test
npm run build:intake
```

独立检查命令只读指定归档；不提供预期摘要时仅计算摘要，不声称与开发者发布字节一致。`--check` 检查收录记录和归档，不生成文件；`npm test` 包含该门禁。

`build:intake` 先检查全部输入，再生成 `site/public/generated/` 下的目录、清单、检验报告和原样下载文件。不通过时不会进入输出替换步骤；输出写入中的磁盘或权限失败会导致构建失败，不能部署该次产物。生成目录只用于当前构建，不作为历史发行存储。

阶段一中网站仍使用旧数据模型，不能把 `build:intake` 生成目录当作已完成的网站集成；阶段二负责切换默认构建入口、网站展示和 CI。旧的 `inspect:pack` / `host:pack` 仅适用 legacy，不适用新收录归档。

## 检验结论

自动报告分别记录清单 Schema、归档布局和 SHA-256，始终标记 `runtime: not-tested` 与 `references: not-resolved`。检验通过不表示来源在线、插件可安装、无恶意代码、功能正确或任意宿主兼容。

实际运行证据应在后续搭载测试完成后独立记录，不能用结构检查替代。

## 样本与正式收录

`fixtures/intake/` 中的样本使用不存在的测试插件，只用于正反测试。测试会在临时目录创建 ZIP 和收录记录，检查下载字节、摘要、失败保留已有输出和删除收录后的清理。

正式 `catalog/feature-packs/` 当前为空，这是有效状态。候选目录不自动公开；测试通过不自动把样本提升为正式内容。
