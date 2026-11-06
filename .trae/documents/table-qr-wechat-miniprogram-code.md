# 桌号二维码改为微信小程序码

## Context

当前二维码把 `{ v, type, tableId, tableNo, token }` 直接编码成 JSON，任何扫码工具都能读取，且无法真正拉起小程序。目标改为：

- 生成微信**小程序码**（`wxa/getwxacodeunlimit`），`scene` 存放 32 位桌台令牌；
- 顾客用微信扫码 → 直接打开点餐小程序 → `pages/menus/index` 从启动参数取 `scene` → 调数据库解析令牌 → 自动绑定桌号并开始点餐；
- 二维码里不再出现任何明文桌号/JSON。

现有令牌恰好是 32 位十六进制，正好满足微信 `scene` 最多 32 字符的限制，无需改表结构。

## 架构决策

| 决策 | 方案 |
|------|------|
| 小程序码生成位置 | Supabase Edge Function（`access_token` 不能下发客户端） |
| 二维码指向页面 | `pages/menus/index`（tabbar 页，微信允许作为 `page`） |
| scene 内容 | 仅 `token`，不携带桌号 |
| 令牌有效期 | 不变，长期有效，仅在管理端「重新生成」时失效 |
| 小程序版本 | 通过服务端密钥 `WX_QR_ENV_VERSION` 配置，默认 `release`，联调用 `develop` |
| 数据库校验 | 新增 `resolve_table_qr(p_token)`，移除 `verify_table_qr(table_id, token)` |

## 实施步骤

### 1. 数据库迁移

新增 `supabase/migrations/20261106010000_add_resolve_table_qr.sql`：

- `public.resolve_table_qr(p_token text) returns jsonb`
  - `security definer`、`set search_path to ''`
  - 空 token → `raise exception 'TABLE_QR_INVALID'`
  - 按 `dining_table_qr_tokens.token` 关联 `dining_tables`
  - 未命中 → `TABLE_QR_INVALID`；`status = 'disabled'` → `TABLE_QR_DISABLED`
  - 返回 `{ id, table_no, table_type, capacity, status, session_id }`（逻辑复用现有 `verify_table_qr` 的查询）
  - `revoke all ... from public`，`grant execute ... to anon, authenticated, service_role`
- `drop function if exists public.verify_table_qr(bigint, text);`
- 用 `mcp_supabase_apply_migration` 应用到远端。

### 2. Edge Function `wechat-qrcode`

新增 `supabase/functions/wechat-qrcode/index.ts`，参照 [wechat-login/index.ts](file:///e:/project/_myself/wtf-menu-uni/supabase/functions/wechat-login/index.ts) 的 CORS / `json()` 风格：

- `verify_jwt: true`；
- 管理员校验复用 [admin-users/index.ts](file:///e:/project/_myself/wtf-menu-uni/supabase/functions/admin-users/index.ts#L84-L103) 的做法：anon client + 调用方 Authorization → `auth.getUser()` → `rpc('is_admin')`，非管理员 403；
- 入参 `{ tokens: string[] }`：校验 `/^[0-9a-f]{32}$/`、去重、最多 100 个；
- `access_token` 内存缓存（`expires_in - 300` 秒），遇到 40001/42001/40014 清缓存重试一次；
- 逐张调用 `POST https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=...`：
  ```json
  {
    "scene": "<token>",
    "page": "pages/menus/index",
    "check_path": false,
    "env_version": "release",
    "width": 430,
    "is_hyaline": false,
    "line_color": { "r": 0, "g": 0, "b": 0 }
  }
  ```
- 成功响应为图片二进制，转成 `data:image/png;base64,...`；失败响应为 JSON（`errcode/errmsg`），转中文错误；
- 并发 4 生成，返回 `{ codes: { [token]: dataUrl } }`；全部失败返回 `{ error }`；
- 可通过 `WX_QR_PAGE`、`WX_QR_ENV_VERSION` 覆盖默认值，复用已有 `WX_APPID` / `WX_SECRET`；
- 用 `mcp_supabase_deploy_edge_function` 部署。

### 3. 服务层

修改 [dining-table.ts](file:///e:/project/_myself/wtf-menu-uni/src/service/ordering/dining-table.ts)：

- 删除 `TableQrPayload`、`buildTableQrPayload`、`parseTableQrPayload`、`VerifiedTable`、`verifyQr`；
- 新增：
  - `ResolvedTable`（原 `VerifiedTable` 改名，字段不变）
  - `resolveQrToken(token: string): Promise<ResolvedTable>` → `supabase.rpc('resolve_table_qr', { p_token })`
  - `getWxacodes(tokens: string[]): Promise<Record<string, string>>` → `supabase.functions.invoke('wechat-qrcode', { body: { tokens } })`；读取 `error.context.json().error` 后抛 `ServiceError`
- 同步 [index.ts](file:///e:/project/_myself/wtf-menu-uni/src/service/ordering/index.ts) 导出。

### 4. 二维码管理页

重写 [qrcode/index.vue](file:///e:/project/_myself/wtf-menu-uni/src/pages/qrcode/index.vue)：

- 列表加载成功后批量请求小程序码，维护 `codeMap: Record<tableId, dataUrl>`（响应按 token 回填到 tableId）；
- 卡片用 `<image mode="aspectFit">` 展示，替代 `wd-qr-code`；生成失败显示占位与「重试」；
- 放大预览：白底容器 + 大图，视觉上保留白边；
- 保存：
  - H5：canvas 给图片加 48px 白边 → `<a download>` 下载 PNG；
  - `MP-WEIXIN`：base64 写入 `wx.env.USER_DATA_PATH` → `uni.saveImageToPhotosAlbum`；
  - 其他端：提示长按图片保存（预览图开启 `show-menu-by-longpress`）；
- 重新生成：保留现有确认弹窗 → `rotateQrToken` → `getWxacodes([newToken])` → 更新 `codeMap`；
- 下拉刷新重新拉列表并重新生成全部二维码。

### 5. 点餐页场景绑定

修改 [menus/index.vue](file:///e:/project/_myself/wtf-menu-uni/src/pages/menus/index.vue)：

- 移除 `scanTableQr`、扫描图标、`parseTableQrPayload` / `verifyQr` 引用；
- 新增 `handleScene(raw)`：
  1. `decodeURIComponent`（容错）→ trim → 校验 32 位十六进制；
  2. `handledScene` 去重，避免 `onLoad` / `onShow` 重复请求；
  3. `DiningTableService.resolveQrToken(token)`；
  4. `tableStore.bind(table.id, table.tableNo)` + 成功 toast；
  5. 失败按 `ServiceError.message` 提示（二维码无效 / 桌台已停用）；
- `onLoad((options) => handleScene(options?.scene))`；
- `onShow` 中追加 `handleScene(uni.getEnterOptionsSync().query?.scene)`，覆盖“小程序已在前台时再扫另一张桌码”的热启动场景，并保留原有 `loadMenu()`。

### 6. 文案

修改 [zh-Hans.json](file:///e:/project/_myself/wtf-menu-uni/src/locale/zh-Hans.json) 与 [en.json](file:///e:/project/_myself/wtf-menu-uni/src/locale/en.json)：

- 删除不再使用的 `menus.table.scanInvalid`、`menus.table.scanFailed`，保留 `scanSuccess`；
- `qrcode.desc` 改为“微信扫码直接打开小程序并绑定桌号”；
- 新增小程序码生成失败 / 重试 / 长按保存提示文案。

### 7. 配置说明（不写代码）

- Edge Function secrets 复用 `WX_APPID` / `WX_SECRET`；
- 联调小程序码时设置 `WX_QR_ENV_VERSION=develop`（需开发者身份扫码），上线改回 `release`；
- 如需换落地页，设置 `WX_QR_PAGE`。

## 验证

1. SQL：`select public.resolve_table_qr('<有效token>')` 返回对应桌号；错误 token 抛 `TABLE_QR_INVALID`；停用桌抛 `TABLE_QR_DISABLED`。
2. 部署后用管理员 JWT 调用 Edge Function，确认返回 `data:image/png;base64,...`；非管理员返回 403。
3. `pnpm type-check`、`pnpm lint`、`pnpm build:mp`（已知 `node_modules/@wot-ui/ui` 类型报错与本次无关）。
4. H5 管理端：打开桌号二维码页 → 显示小程序码 → 放大预览 → 下载带白边 PNG。
5. 微信开发者工具：用 `develop` 版本编译，扫码进入点餐页，确认自动绑定桌号并弹出成功提示；热启动再扫另一张桌码可切换绑定。
6. 重新生成令牌后，旧小程序码扫码提示“二维码无效”，新码正常绑定。

## 风险

- 小程序码要求小程序对应版本已发布；开发版必须由开发者/体验者扫码。
- tabbar 页面作为 `page` 参数可正常打开；若某些基础库版本异常，可退化为非 tabbar 落地页再 `switchTab`。
- 批量 base64 响应体积较大，已通过单次 100 张 + 并发 4 控制。
