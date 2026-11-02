# AegisFlow 演示视频录制需求书（给 WorkBuddy）

> 历史录制需求。2026-11-02 最终成片、分镜与验证结果以 `VIDEO-HANDOFF.md`、
> `DEMO-SCRIPT.md` 和 `DEVPOST-READY.md` 为准；下文旧 AWS 能力描述不代表当前已验证范围。

目标：为 Devpost 提交录制一段 2–3 分钟的产品演示视频。请严格按下面的分镜执行。

## 技术规格
- **分辨率**：1920×1080（或 1440×900），**30fps**，**MP4 (H.264)**，≤ 200MB
- **录制范围**：仅浏览器窗口（localhost:8080 页面），不要录整个桌面
- **时长**：120–170 秒
- **音频**：可不录（后续用户配旁白）；若录，环境安静即可，不要求专业设备
- **输出文件**：`C:\Users\62723\.zcode\workspace\default\hackathon-a10-aws-2026\team-alpha\docs\demo\aegisflow-demo.mp4`

## 启动应用（录制前）
```bash
cd C:\Users\62723\.zcode\workspace\default\hackathon-a10-aws-2026\team-alpha
node server.js        # → http://localhost:8080 （保持运行，勿关）
```
浏览器打开 http://localhost:8080 ，等 ~60 秒让基线校准（分数归零、图表平稳）再开始录。

## 分镜脚本（每段的画面与操作）

### 镜头 1 · 基线（0:00–0:25）
- 什么都不点，展示首页静止状态
- 需要入镜的读数：**SCORE 0 · Normal traffic**、EDGE RPS ≈ 300、P95 ≈ 38ms、
  IP ENTROPY ≈ 5.7、Alert Feed 显示 "No alerts — baseline calm"
- 光标缓慢扫过 KPI 行即可

### 镜头 2 · 发起攻击（0:25–0:55）
- 页面右侧 **Attack Simulator — Scenario Launcher** 面板，点击 **HTTP Flood (L7)** 按钮
- 等待 15–20 秒，期间光标指向 Anomaly Score 仪表
- 预期画面：EDGE RPS 冲到 **1.5k+**（红色）、SCORE 飙升变橙/红、
  Alert Feed 弹出 **"Detected: HTTP Flood (L7) — score=56 conf=1"**、
  Top Sources 出现大量标红 **attacker** 源

### 镜头 3 · AI 自动缓解（0:55–1:30）
- 若 AUTO-MITIGATE 开关（页头右侧）未开：先点开它（变青色 ARMED）
- 重新点击 **HTTP Flood (L7)** 再来一轮（先在 Attack Simulator 点 Stop all 清场约 5 秒）
- 等 5–10 秒：Alert Feed 依次出现
  **"AUTO · Rate-Limit applied (path=/api/search)"**
- 预期画面：Top Sources 里攻击者 rps 全部被压到 **30**，MITIGATED 列出现 **▼ 数字**、
  **MITIGATED/S ≈ 1k+**（黄色）、ORIGIN RPS 从 1.5k+ 回落到 ~500、P95 恢复 ~41ms
- 这段是核心，停留足够久让观众看清数字变化

### 镜头 4 · 克制时刻（1:30–2:05）
- Attack Simulator 点 **Stop all**，在 Mitigation Playbook 面板点 **Clear**（如有）
- 等 5 秒回稳，然后点击 **Flash Crowd (benign spike)**
- 等 12–15 秒
- 预期画面：EDGE RPS 冲到 **2.5k+** 但**全是 human/mobile 绿色源**（Unique IPs 478+，
  IP ENTROPY 8+）、SCORE 停在 ~40 琥珀色、仪表文字
  **"Benign flash crowd — Recommended: Serve from edge cache — do NOT block"**、
  **MITIGATED/S 保持 0**（一个都没拦）、AUTO-MITIGATE 依然 ARMED
- 这段讲的是"知道何时不作为"，必须完整展示

### 镜头 5 · AWS 故事（2:05–2:35）
- 新标签页打开文件 `aws/ARCHITECTURE.md`（VS Code 或浏览器 markdown 预览均可）
- 展示"Console playbook → AWS API"映射表 10–15 秒
- 再切到 `lib/aws-adapter.js`，滚动到 `awsDispatcher` 函数（真实 WAFv2 SDK 调用），停留 5 秒
- 旁白要点：USE_AWS=1 时同一套 Playbook 会推送到真实 WAFv2

### 镜头 6 · 收尾（2:35–2:45）
- 切回控制台，画面定格在全景，结束

## 注意事项
- 每个镜头可以单独录多条，后期拼接；镜头 3/4 的数字是关键，不达标就重录
- 页面若停留过久数据漂移属正常（模拟器是活的），以"趋势"为准不必逐帧吻合
- 录完把文件放到上面指定的输出路径
