# END-EAC v1.1.0 候选核验记录

## 固定输入

- 仓库：`https://github.com/BAIKAI23333/END-EAC-on-Deespeek-desktop`
- tag：`v1.1.0`
- commit：`7eec9741f3f2491c6e33ed56c5e1fd3bd588bc1f`
- Release 资产：`dsh-eac-desktop-pack-1.1.0.tgz`
- 资产 SHA-256：`9393044bb7d501d17f7dfe8900f4432366ea0560c21ff640a2262681ab5718c6`

## 核验结果

资产可以读取为 npm 包 `@dsh-eac/desktop-pack@1.1.0`，包含 12 个 EAC 插件及其
`dsh-plugin.json`，目标内核为 `0.1.7-rc.2`，许可证声明为 MIT。

该资产不是 Mojobox MVP 的 Feature Pack v1：

- 根清单是 npm `package.json`，不是 Feature Pack v1 的 `pack.json`；
- 归档没有 `packs-index.json` 条目或 `plugins[].ref` Feature Pack 清单；
- 安装入口是官方插件管理器 / `dsh plugin add`，不是宿主 Feature Pack CLI 的 Pack 输入；
- `cordis.patch.yml` 和 `dsh-plugin.json` 属于 DSH 插件包语义，不能直接当作 Mojobox Pack/Lock。

## 决定

原始 npm tgz 暂不收录到生产 Catalog、Pack 或市场索引。Mojobox 已另建一个薄的 Feature Pack
v1 描述草稿，位于 `candidates/feature-packs/dev.dsh-eac.desktop-pack-1.1.0/pack.json`，
只引用 `@dsh-eac/desktop-pack@1.1.0`，不复制内部成员，也不做 npm tgz 到 Feature Pack 的
静默转换。该草稿在生成最终 `.dshpack`、固定归档摘要并完成隔离宿主验收前，不得进入生产索引。

## 描述包复核（2026-09-30）

临时描述包已按官方运行时清单规则复核：`formatVersion`、包 ID、版本、内核范围、插件引用
和空 `overrides` 均通过。清单中的 `$schema` 元字段不属于仓库 Feature Pack Schema 的允许
字段，已移除以保持 Schema 与归档内容一致。

当前仍不能生成可发布归档或生产索引：

- `candidates/feature-packs/dev.dsh-eac.desktop-pack-1.1.0/` 只有 `pack.json` 和说明文件，没有
  `.dshpack`；
- `@dsh-eac/desktop-pack@1.1.0` 在 npm registry 返回 `E404`，因此 `plugins[].ref` 目前没有
  可被宿主按清单解析的公开 npm 来源；
- 之前固定的 GitHub `.tgz` 是 npm 聚合包，不是 Feature Pack，也不能静默替代该引用。

结论：描述包结构核验通过，但来源和真实归档未满足发布门槛；保持候选草稿状态，不生成
`packs-index.json` 条目。

## 验证范围

本记录只证明来源、版本、归档字节和格式差异；没有把 GitHub 页面、Schema 通过或下载成功
解释为宿主安装兼容性，也没有签发 Evidence。
