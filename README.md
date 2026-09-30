# DSH Mojobox

Mojobox 是面向 DSH 生态的整合包目录：收纳开发者产物，进行静态检验，展示来源与检查结果，并提供原始文件下载。整合包内容和更新由开发者维护，安装与运行由对应宿主负责。

当前版本为 `0.1.0-alpha.0`。开发顺序是：先完成 Mojobox 框架，再适配真实整合包，最后搭载测试。当前正式收录为空，测试演示独立提供，不作为正式内容发布。

框架阶段已完成 3/3，验证范围及尚未完成的真实适配见[框架验收记录](docs/framework-acceptance.md)。

## 本地运行

要求 Node.js 22.12 或更新的受支持版本。

```bash
npm ci
npm test
npm run dev
```

默认网站读取 `catalog/feature-packs/`，检验 `artifacts/` 中对应文件，生成目录与下载。没有正式收录时展示空目录，不回退到历史包。

查看带样本的演示：

```bash
npm run build:demo
npm run preview:demo
```

演示使用 `fixtures/intake/` 的合成样本，页面明确标注“测试演示”，不能用于安装。生成物位于 `dist-demo/`；正式构建位于 `dist/`，两者隔离。

## 收录整合包

先阅读[收录规范](docs/intake.md)。

1. 开发者提供现成的薄 Feature Pack v1 归档。
2. 将文件放入 `artifacts/<id>-<version>.dshpack`。
3. 在 `catalog/feature-packs/<id>.json` 记录格式、身份、版本、来源、作者、许可证和真实 SHA-256。
4. 执行以下检查和构建：

```bash
npm run inspect:feature-pack -- artifacts/<id>-<version>.dshpack
npm test
npm run build
npm run verify:downloads
```

构建原样复制开发者归档，不组合插件、不重打包、不执行组件。网站提供归档、清单与检验报告，并展示摘要、大小、作者及声明的兼容要求。

自动检查涵盖清单结构、归档布局、摘要和收录记录一致性。插件引用不在构建时解析，运行兼容与安全性不由静态检查背书；作者声明与实测结论分开呈现。

## 构建与发布

```bash
npm run build
npm run verify:downloads
npm run preview
```

子路径部署设置 `BASE_PATH`，详见[部署说明](docs/deployment.md)。PR 工作流验证正式目录及演示；发布工作流仅接收正式 `dist/`，下载检查拒绝演示目录。

本地构建不代表已经部署，也不代表宿主搭载通过。

## 事实源

| 路径 | 用途 |
| --- | --- |
| `catalog/feature-packs/` | 当前收录记录 |
| `artifacts/` | 开发者原始归档 |
| `schemas/intake.schema.json` | 收录记录契约 |
| `vendor/eac/` | 固定的输入格式 Schema 与许可证 |
| `fixtures/intake/` | 明确隔离的测试样本 |
| `scripts/feature-pack.mjs` | 归档检查 |
| `scripts/build-catalog.mjs` | 收录数据与下载构建 |
| `scripts/verify-downloads.mjs` | 最终产物独立复核 |
| `site/` | 静态网站 |

`site/public/generated/`、`dist/`、`dist-demo/` 和 `.cache/` 是生成物，不手工编辑或提交。

## 历史链路与边界

旧 `catalog/packs/`、Pack/Lock、插件目录和 Evidence 保留用于历史测试与参考，默认网站不发布它们。
`inspect:pack`、`lock:pack` 和 `host:pack` 是 legacy 命令，不能用于当前 Feature Pack 收录。
不静默转换两种同后缀格式，不扩展安装器、Profile 管理或宿主事务。

更多资料：[实施进度](docs/implementation-plan.md)、[贡献说明](CONTRIBUTING.md)、[历史架构](docs/architecture.md)、[AGENTS.md](AGENTS.md)。

## License

[MIT](LICENSE)
