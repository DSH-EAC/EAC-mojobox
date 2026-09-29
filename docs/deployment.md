# 静态构建与部署

使用 Node.js 22.12 或更新的受支持版本。先执行 `npm ci` 和 `npm test`。
根路径部署执行 `npm run build`；子路径在 PowerShell 中执行：

```powershell
$env:BASE_PATH = '/dsh-mojobox/'
npm run build
Remove-Item Env:BASE_PATH
```

Bash 中为 `BASE_PATH=/dsh-mojobox/ npm run build`。产物在 `dist/`，部署整个目录，保留
`generated/` 的相对关系。用 `npm run preview -- --host 127.0.0.1` 检查结果。

## 发布要求

- `check.yml` 在 PR 中校验和构建，不持有部署权限。
- 现有 `pages.yml` 在 main 或手动触发时部署；仓库仍需实际启用 Pages。
- 失败构建不上传；目录与归档一起部署，不直接构建到正在服务的目录。
- 新版本使用新版本号与归档路径。自行托管时保留仍被引用的旧下载。
- 验证目录和归档链接、大小与 SHA-256，不能只检查首页。
- 目录使用短缓存；归档只有在 URL 不原地替换时才使用长缓存。

## 下载与缓存

组件缓存位于 `.cache/artifacts/<sha256>`，每次读取检查摘要。首次构建需要访问源地址，但
不会安装或执行包代码。外部 PR 的检查不得持有部署凭据。

网络缓慢时先检查本机 7897 监听地址，再对当前下载进程临时使用代理，不写入全局配置。
Node fetch 的代理支持与 Node 版本有关，不能仅设置环境变量就认为代理已生效。

本轮未启用托管或发布站点。静态构建成功不表示宿主导入通过验证。
