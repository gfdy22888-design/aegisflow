# AegisFlow：最后由你提交 Devpost

项目材料已整理。最终 Devpost 表单、资格声明及团队成员由你本人处理。

## 直接填写的链接

| 字段 | 内容 |
|---|---|
| Project name | AegisFlow |
| Git repository | https://github.com/gfdy22888-design/aegisflow |
| Try it out / website | https://gfdy22888-design.github.io/aegisflow/ |
| Interactive demo | https://gfdy22888-design.github.io/aegisflow/live.html |
| 在线 MP4 | https://gfdy22888-design.github.io/aegisflow/docs/demo/aegisflow-demo.mp4 |

英文 Elevator pitch 和各正文段落直接复制项目根目录 `SUBMISSION.md`。
如 Devpost 将正文集中在一个编辑器内，复制 Inspiration 至 What's next，保留小标题。
按实际情况填写 Built with；其中 AWS 为原型代码与 IaC，尚未真实部署。

## 上传文件

- 项目缩略图：`docs/logo.png`（640×640）；可编辑源文件为 `docs/logo.svg`。
- 画廊截图，推荐顺序：`01-baseline.png`、`02-attack-detected.png`、
  `03-autopilot-mitigated.png`、`04-benign-restraint.png`，均在 `docs/screenshots/`。
- 视频：`docs/demo/aegisflow-demo.mp4`，2:10、1080p30、H.264/AAC，含英文合成旁白。
- 可选字幕：`docs/demo/aegisflow-demo.en.srt`；在线播放器已有英文 VTT 字幕。

在线演示页包含可播放的视频。如表单的专用 Video URL 栏只接受 YouTube/Vimeo，
可留空，并使用上面的 Try it out 链接；主办方将视频列为推荐材料，未将其列为必填。
无需为了提交另行建立视频平台账号。不得将 GitHub MP4 地址描述成 YouTube 链接。

## 你在 Devpost 的操作

1. 登录本人账号，完成活动报名和参赛资格声明。
2. 新建或打开项目，填写项目名、pitch、正文和仓库链接。
3. 加入所有真实团队成员；上传缩略图和画廊截图，填写在线演示链接。
4. 预览并确认所填个人/团队信息后，由你点击最终提交。

## 官方要求与资格（2026-11-02 核对）

- [活动主页](https://a10-x-aws-hack-26.devpost.com/)显示活动日期为 **2026-11-07 至 11-08**。
  具体开放、截止时间和时区以你的 Devpost 页面当时显示为准。
- 官方必需材料为 git 仓库链接，并将所有团队成员加入 Devpost 项目。
- [完整规则](https://a10-x-aws-hack-26.devpost.com/rules)比主页写得更具体：
  **18 岁以上、Santa Clara University 学生、美国境内、2–6 人团队**。
  如不符合，不要勾选不真实的资格声明，应先向主办方核实是否有例外。
- 官方说明允许使用 AI 工具，并要求参赛者理解提交的代码、架构与工具。

## 项目真实完成范围

本地及浏览器中的检测、场景、缓解、自动响应、审计和回放均可运行。
测试覆盖 21 项；视频/字幕、截图、缩略图和在线演示齐备。
AWS 适配器经过离线契约及 SDK 序列化检查，参考模板可解析；
**没有真实 AWS 部署或云端性能验证**。全部展示流量、p95 和卸载值均为合成仿真。
这些边界已经在英文文案、仓库 README 和视频旁白中说明。

原始视频与旧文件保存在本机忽略目录 `.delivery-work/archive/`，不作为提交材料。
