# AegisFlow 最终视频与项目交接

本文件于 2026-11-02 更新，替代 WorkBuddy 的首轮录制交接说明。
原说明、原无声 MP4 和旧 WEBM 已保存在本机 `.delivery-work/archive/`。

## 交付文件

- `docs/demo/aegisflow-demo.mp4`：新版 130 秒、1920×1080、30fps、H.264/AAC，含英文合成旁白。
- `docs/demo/aegisflow-demo.en.srt` / `.en.vtt`：英文字幕。
- `docs/demo/narration.json`：逐段旁白原文与时间轴。
- `docs/screenshots/`：基线、攻击、自动缓解、良性洪峰四张新版截图。
- `docs/logo.svg` / `.png`：可编辑矢量缩略图和 PNG。
- `docs/DEVPOST-READY.md`：用户最终提交说明。
- `SUBMISSION.md`：可复制的英文项目字段。

## 本轮修复

- 保留并复核 `snapshot().scenarioList` 修复，场景按钮正常显示。
- Edge rps 改为真实的模拟入口流量；图表不再将已缓解流量重复叠加。
- 缓存后的 Origin rps 不再重复扣减卸载量。
- 修复场景按钮文字对比度，压缩桌面布局。
- 修复畸形 URL 可能触发的未捕获异常，以及静态目录边界检查。
- AWS 原型使用正确的 WAFV2Client，读写 LockToken、保留现有规则、串行更新、成功后去重，失败可重试。
- 显式 IP 封禁更新 IPSet；限流采用 60 秒窗口并保留路径条件；CloudWatch 指标与告警维度一致。
- 修复参考模板 YAML 引号、私有源桶读取策略和资源 ID 输出。
- 提交文案明确区分本地仿真、离线测试的 AWS 原型与未来功能。

## 验证证据

- `npm test`：21 项通过，包括场景发现、持续攻击、良性洪峰零拦截、流量守恒、AWS 请求契约和服务启动。
- `docs/demo/verification/recording-report.json`：录像时的 API 状态与截图索引。
- `media-report.json`：最终 MP4 参数、13 段非静音音轨检查和最终成片抽帧。
- `static-report.json`：浏览器交互版、自动缓解及离线回放验证。
- `sdk-template-report.json`：真实 AWS SDK 序列化与 YAML 解析，HTTP 处理器为本地测试替身，未调用 AWS。

完整分镜见 `docs/DEMO-SCRIPT.md`。本地服务和录制进程在验证结束后停止。

## 重要边界

全部流量、延迟与卸载值均为合成仿真。未部署或验证真实 AWS 账户。
AWS 原型仅支持显式手动添加部分规则；云端自动响应、移除同步、运行时缓存修改、
Shield Advanced 和实时流量采集属于后续工作，材料不将其表述为已完成。

本轮不操作用户的 Devpost 提交、个人资格声明或团队身份。
