# DSH EAC Desktop Pack Feature Pack 草稿

这是 `@dsh-eac/desktop-pack@1.1.0` 的薄 Feature Pack v1 描述包草稿。

它只包含 `pack.json`，通过 `plugins[].ref` 引用现有 npm 聚合包，不复制 12 个成员插件，
也不携带 `node_modules` 或用户层 `cordis.patch.yml`。

当前状态：候选草稿，不进入生产 `packs-index.json`。

发布前仍需补齐：

- 使用本清单生成最终 `.dshpack`；
- 固定 `.dshpack` 的 Release URL 和 SHA-256；
- 在目标官方桌面版本的隔离 Profile 中完成安装、重启、重复安装和失败路径验收；
- 验收通过后再生成市场索引条目。
