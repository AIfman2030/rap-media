# Rap 科普短视频生成器

> 输入歌词或主题句 → AI 生成画面 → Suno 生成说唱 → 一键导出 16:9 MP4 视频

一个纯浏览器端运行的科普短视频工具。把文字变成带画面、带人声 Rap 的视频，适合短视频科普内容创作。

## 功能概览

- **歌词 → 分镜**：按行拆分歌词，自动匹配关键词（科学/商业/回收/能源…），生成视觉分镜
- **AI 生图**：通过 Right Code 代理（`gpt-image-2`）为每个分镜生成 1536×864 背景图
- **AI 说唱**：对接 Suno API 代理（sunoapi.org / sunoboard.com），生成带人声的中文说唱
- **4 种视觉风格**：爆款栏目包装 / 霓虹实验室 / 科普手账 / 新闻演播室
- **Canvas 实时预览**：卡拉 OK 字幕 + 底部跑马灯 + 音频同步播放
- **一键导出**：Canvas → MediaRecorder → MP4 / WebM 文件下载

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | 原生 JS + Canvas 2D + Web Audio API |
| 图片代理 | Node.js HTTP 代理（本地）+ Vercel Serverless Function（线上） |
| 音频 | Web Audio API（起止点检测 + 节拍合成）+ Suno API |
| 导出 | `canvas.captureStream()` + `MediaRecorder` |

## 文件结构

```
.
├── index.html          # 主页面（控制面板 + Canvas 舞台）
├── app.js              # 核心逻辑（分镜/渲染/音频/导出）
├── server.js           # 本地开发服务器
├── image-proxy.js      # Right Code 图片生成代理
├── styles.css          # 暗色主题样式
└── api/
    └── draw-image.js   # Vercel Serverless 函数入口
```

## 前置准备

使用本项目需要两个 API Key：

| 服务 | 用途 | 获取方式 |
|---|---|---|
| Right Code 图片 API | AI 生成画面 | 填写在页面「图像 API Key」输入框 |
| Suno API 代理 Token | AI 生成说唱 | 从 sunoapi.org 或 api.sunoboard.com 获取，填写在「API Token」 |

## 使用步骤

### 1. 本地运行

```bash
# 进入项目目录
cd /Users/xiaofu/project/codex-project

# 启动本地服务器（端口 4175）
node server.js
```

浏览器打开 `http://127.0.0.1:4175`。

### 2. 填入歌词

在左侧「输入歌词或主题句」文本框中输入内容，每行一句。例如：

```
塑料瓶别乱扔
太阳一晒会变形
回收之后再加工
节能减排更轻松
```

### 3. 生成分镜

点击 **生成分镜**，系统会把歌词拆成镜头，底部时间线会显示每个镜头。

### 4. 生成画面

1. 在「图像 API Key」填入 Right Code 的 Key
2. 选择画面风格（爆款栏目包装 / 霓虹实验室 / 科普手账 / 新闻演播室）
3. 点击 **生成画面**，系统会为每一组分镜生成配图

> 图片生成通过本地代理（`/api/draw-image`）调用 Right Code API，部署到 Vercel 后使用 Serverless Function 代理。

### 5. 生成说唱

**测试模式（默认开启）：**
- 不调用 Suno API，使用浏览器合成节拍
- 适合先预览画面效果

**正式模式：**
1. 关闭「音乐测试开关」
2. 选择代理服务商（sunoapi.org / api.sunoboard.com）
3. 填入 API Token
4. 点击 **生成说唱**，等待 Suno API 返回音频

> Suno API 生成需要 1-3 分钟，完成后音频会自动加载到播放器。

### 6. 预览播放

点击 **预览播放**，Canvas 画面会随音频同步播放，字幕高亮跟随节奏。

### 7. 导出视频

点击 **导出 MP4**：
- 系统会录制 Canvas 画面 + 音频
- 优先使用 Suno 生成的人声 Rap
- 没有音频时自动回退到浏览器合成节拍
- 支持 MP4（Safari）和 WebM（Chrome），自动选择最佳格式
- 下载文件名：`rap-science-video.mp4`（或 `.webm`）

## 可选配置

| 参数 | 默认值 | 说明 |
|---|---|---|
| BPM | 96 | 测试节拍速度 |
| 每句时长 | 3.5s | 分镜默认持续时间（有真实音频时自动对齐） |
| 字幕延迟 | 0s | 字幕偏移调整 |
| 底部文案 | 自定义 | 视频底部跑马灯文字 |
| 每张图行数 | 2 | 每张背景图覆盖几句歌词 |
| 已有音频 URL | - | 粘贴已生成的 mp3 地址，跳过 Suno API |
| 本地音频文件 | - | 上传本地音频文件 |

## 部署到 Vercel

项目已配置为 Vercel 项目（Project ID: `prj_z8AUquSTScnmwR9nuHpwqyVzWscn`）。

```bash
# 安装 Vercel CLI
npm i -g vercel

# 部署
cd /Users/xiaofu/project/codex-project
vercel --prod
```

API 路由 `/api/draw-image` 会自动作为 Serverless Function 运行。

## 注意事项

- **图片代理**：本地开发时 `image-proxy.js` 由 `server.js` 挂载；Vercel 上由 `api/draw-image.js` 处理
- **音频跨域**：远程音频 URL 可能被 CORS 阻止，可以用「本地音频文件」上传绕过
- **MP4 支持**：Chrome 的 MediaRecorder 只支持 WebM，Safari 支持 MP4。需要 MP4 格式时用 Safari 打开本页
- **测试模式**：关闭后才会调用 Suno API，打开时只生成浏览器节拍

---

**仓库地址**：https://github.com/AIfman2030/rap-media
