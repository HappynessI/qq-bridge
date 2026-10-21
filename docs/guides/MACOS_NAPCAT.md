# macOS + NapCat 使用说明

本适配基于 Derpyu520/qq-bridge 的 0.2.0-r4，保留 DSH 模型、原角色卡、二代仿真模式、控制台、会话记忆和主动唤醒机制。

## 环境要求

| 项目 | 已验证环境 |
| --- | --- |
| DSH | DeepSeek Harness 桌面版 0.2.1-rc.2，desktop profile |
| 模型 | deepseek-official / deepseek-flash，high |
| QQ 接入 | Colima 中运行 NapCat，OneBot 正向 WebSocket 127.0.0.1:3001 |
| Node.js | 项目要求至少 22.13.0，本次使用 26.9.0 |
| 运行目录 | ~/Library/Application Support/qq-bridge |
| 后台服务 | local.qq-bridge.xiaojing |

多个程序可以通过同一个 NapCat 接收同一 QQ 账号的消息。桥接只处理白名单内的群；已有的采集或总结程序可以保留自己的连接。发言身份是 NapCat 登录的 QQ 账号，群内显示名可以通过群名片设置。QQ 官方机器人属于另一套接入方式。

## 安装

1. 安装 Node.js，启动 DSH 桌面应用，并确认 `desktop` profile 中的模型可用。
2. 启动 NapCat，登录 QQ，启用 OneBot 正向 WebSocket；Docker 端口映射到本机回环地址。此安装器不会安装或重启 NapCat。
3. 在仓库目录执行 `npm ci`，将 `config.example.json` 复制为 `config.json`。
4. 按下面的连接示例修改 `snowluma`，并填写 `dsh.provider`、`dsh.model`、`ownerQQ` 和 `allow.groups`。保留 `allowAllWhenEmpty: false`；白名单为空时不会接收群聊。DSH 的 `baseUrl` 由启动器自动发现。
5. 执行 `node scripts/macos-service.mjs install`，安装到用户的 Application Support 目录并注册 launchd 服务。首次安装必须先准备好 `config.json`。
6. 双击 `打开小鲸控制台.command`，选择角色卡，确认二代仿真模式和群白名单。执行 `node scripts/check-macos-live.mjs` 检查真实服务连接。

安装器使用 DSH 应用内置 CLI 注册 QQ 预设和 MCP 服务；如果 DSH 没有自动重新加载配置，重启 DSH 桌面应用。安装后的运行配置、角色卡与状态保存在 Application Support 中，更新代码时会保留。

## 日常使用

双击仓库根目录的 `打开小鲸控制台.command`。启动器会在本机读取管理令牌并打开控制台，无需手动复制令牌。

- 在控制台的角色管理中选择或编辑角色，例如项目自带的“小鲸鱼”。
- 在二代仿真设置中调整主动发言频率、等待和唤醒条件。
- 收藏表情可按语境主动发送，不要求固定聊天轮数；也可单独用一张表情表达反应。机器人通过备注、标签和本地笔记搜索后选图。
- 收藏超过 100 张时，可将 `socialV2.sticker.maxListCount` 调到 500，确保整个收藏库参与同步和搜索。较大的 GIF 可调整 `socialV2.media.maxBytes`，该设置重启桥接后生效，最高 20 MiB。
- 添加其他群前，先让这个 QQ 账号加入群，再在白名单里明确添加群号。
- DSH 桌面应用、Colima 和 NapCat 需要保持运行；电脑睡眠或 QQ 离线期间无法回复。

运行目录放在 Application Support，避免后台进程依赖 Documents 目录访问权限。launchd 在用户登录后启动小鲸，异常退出后重新启动。启动器自动发现并验证 DSH 桌面服务的本地端口；连续三次健康检查失败后退出，由 launchd 重新发现端口。它不会重启 DSH 或修改 NapCat。

在本仓库目录执行：

```sh
node scripts/macos-service.mjs status
node scripts/macos-service.mjs stop
node scripts/macos-service.mjs start
node scripts/check-macos-live.mjs
```

`stop` 会停止并卸载本次登录会话中的后台服务；重新执行 `start` 或下次登录会加载它。更新代码后执行 `node scripts/macos-service.mjs install`，会同步代码到运行目录、重新注册 DSH 插件并启动服务，保留已安装的配置、角色卡和状态。

主动发言可以在控制台配置。例如每 30–90 分钟检查一次，至少空闲 15 分钟，基础机会概率 0.3。近期已发言、夜间或消息较多时，原项目会降低概率；模型仍可选择不发言，因此这不是固定频率的定时播报。

## 适配内容

- 新增 OneBot WebSocket 请求传输，消息发送、在线检查、MCP 查询均可复用现有 NapCat 的 3001 端口。原 HTTP 模式继续可用。
- macOS 使用 lsof 检查监听端口，安装时识别 DSH 应用内置 CLI。
- QQ 预设移除不存在的 cwd 变量，并关闭工作目录等运行环境提示注入；角色正文仍来自原项目。
- 后台提醒附带正确的群会话 key，避免模型猜测目标群导致工具认证失败。
- 主动检查参数保存后立即重新安排定时器。
- 提供 macOS 后台服务、控制台入口和真实服务检查脚本。
- 通过 `get_version_info` 识别 NapCat；收藏时将安全下载的原始图片分块上传到 NapCat，再调用 `add_custom_face`。不需要给 Docker 增加宿主机共享目录，上传临时文件五分钟后自动清理。
- 兼容 NapCat 的 `emoId` / `resId` 和 `set_custom_face_desc`，收藏与备注均回读确认，备注失败会单独报告。收藏表情发送支持 WebSocket。
- GIF 和 WebP 向模型提供最多三张 PNG 静态采样预览，保留原始图片用于收藏和发送。采样不能表示动画的全部动作。
- MCP 启动参数携带桥接版本，安装新版本时触发 DSH 重载，避免继续运行旧代码。

关键连接配置如下，字段名 snowluma 为兼容原项目而保留：

```json
{
  "snowluma": {
    "transport": "websocket",
    "wsUrl": "ws://127.0.0.1:3001",
    "accessToken": "",
    "followDiscoveredEndpoint": false
  }
}
```

`accessToken` 必须与 NapCat 配置一致；只有网关未配置令牌时才能留空。配置和运行状态不纳入 Git。

## 验证记录

2026-10-21 已在真实 NapCat、DSH 和 QQ 客户端验证：

- NapCat 登录、在线状态、测试群成员查询正常。
- DSH Cookie 认证、QQ 专用预设和三个 MCP 服务握手正常。
- 原版“小鲸鱼”角色从控制台启用，模型实际读取角色卡。
- QQ 客户端发送真实提问，桥接接收并调用模型；角色回复在发送方 QQ 客户端可见。
- 真实定时器以 proactiveCheck 唤醒模型，在没有新群消息时主动发言，QQ 客户端可见。验证时临时设置一分钟检查间隔并提供待聊话题，完成后恢复正常频率并清理临时话题。
- launchd 后台安装、停止、重新启动和重复安装成功；重启后的角色、群白名单和会话状态保留。
- 禁用群的唤醒请求被 403 拒绝；无令牌的控制台 API 被 401 拒绝。
- `check-macos-live.mjs` 真实调用 MCP → NapCat，并验证 OneBot 错误会抛出，不生成模拟结果。
- 一张 500×500、99 帧的真实 GIF 经 MCP 返回三张 PNG，DSH 模型实际收到并描述了角色、电脑和杯子，未再出现 GIF 解码堆栈溢出。
- 同一张原始 GIF 成功收藏并写入备注，NapCat 收藏列表回读确认；再次收藏复用已有记录。
- 收藏表情通过 MCP 发送到测试群，`get_msg` 回读消息后下载图片，确认仍为 99 帧 GIF。
- 运行目录中的表情自检 40 项通过。可使用只读脚本复查真实消息及已有收藏：

```sh
node scripts/check-media-live.mjs --root "$HOME/Library/Application Support/qq-bridge" --key group:你的群号 --message 消息ID --sticker 收藏ID
```

`--sticker` 可省略。脚本只读取图片和收藏，不发送消息、不添加收藏；不会打印会话令牌。模型是否正确理解图片仍需结合实际 DSH 回复判断。

语音库未配置；合并转发等其他扩展能力未逐项实测，不列入本次通过项。
