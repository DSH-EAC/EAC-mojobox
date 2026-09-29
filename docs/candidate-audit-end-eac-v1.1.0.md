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

## 验证范围

本记录只证明来源、版本、归档字节和格式差异；没有把 GitHub 页面、Schema 通过或下载成功
解释为宿主安装兼容性，也没有签发 Evidence。
