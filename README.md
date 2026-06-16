# Visual Director

> **Portrait Director Agent** — 把一句话需求转成结构化的人物视觉方案，再生成高质量中文 Prompt 出图。

输入一句模糊的话（如「美女」「旗袍美女」），Agent 先选定一套**美学主题**（古风旗袍 / 日系阳光胶片 / 韩系生活感 / 轻奢微性感 / 氛围感情绪片… 共 9 型），再在主题的允许池内**确定性采样**出场景 / 光线 / 姿势 / 服装配色 + 人脸，组装成完整方案，产出适配字节即梦（Seedream）的中文 Prompt，最后出图。它解决的是「**拍什么风格、在哪、怎么拍、什么脸**」，让一句话变成一组**主题与气质各异**的写真，而不是千篇一律的网红脸。

> **状态：早期实验项目（v0.1 · experimental）** — 核心链路已跑通，欢迎试用与 issue 反馈。它擅长「主题 / 场景 / 风格 / 气质」的差异化；**脸部身份级控制（V2）** 与 **出图质量闭环（Vision Critic, v0.2）** 仍在 [Roadmap](#roadmap) 上。

## 效果示例

模糊输入 `美女` 时逐张轮换不同美学主题，一次生成一组主题 / 气质各异的写真（差异来自主题视觉骨架 + 规则化人脸采样，全部出自本项目 `outputs/`）：

<table>
  <tr>
    <td align="center"><img src="docs/samples/01_guofeng_jiangnan.jpg" width="200"><br>古风旗袍 · 江南水乡</td>
    <td align="center"><img src="docs/samples/02_hanxi_cafe.jpg" width="200"><br>韩系生活感 · 咖啡馆</td>
    <td align="center"><img src="docs/samples/03_rixi_bookstore.jpg" width="200"><br>日系阳光胶片 · 旧书店</td>
  </tr>
  <tr>
    <td align="center"><img src="docs/samples/04_qingshe_window.jpg" width="200"><br>轻奢微性感 · 飘窗</td>
    <td align="center"><img src="docs/samples/05_fenwei_car.jpg" width="200"><br>氛围感情绪片 · 车内夜景</td>
    <td align="center"><img src="docs/samples/06_shencai_studio.jpg" width="200"><br>黑丝美腿身材向 · 暗调棚拍</td>
  </tr>
</table>

```bash
# 模糊输入：逐张轮换主题，一组多样
npm start "美女" -- --batch 6 --image

# 锁定主题：同一主题下多个不同的人
npm start "旗袍美女" -- --batch 6 --image
```

## 擅长 / 不擅长（重要，先说清楚）

| 擅长 ✅ | 不擅长 ❌ |
| --- | --- |
| 把模糊需求规划成具体**美学主题 / 场景 / 光线 / 服装** | 让同一组图里的**脸是身份级别的不同人** |
| 用**主题轮换 + 视觉骨架采样 + 人脸采样**拉开差异 | 精确控制脸型 / 眼型等五官几何 |
| 全链路中文、可控、可复现采样 | 风景 / 物品 / 多人群像等非人物题材 |

> 诚实说明：纯文生图（即梦/Seedream）对**脸部几何**的控制力有限——会回归它自己的"漂亮脸"先验。本项目用规则采样 + Face First Prompt 把差异尽可能传递给模型，但要做到「身份级别的不同脸」，需要参考图 / img2img / 身份控制（见 [Roadmap](#roadmap)，V2）。

## 链路

```
一句话
  → Planner（DeepSeek）            解析意图：主题 / 用户钉死维度(pinned) / 碎信息(extras)
  → 主题视觉骨架采样器（纯规则）    按主题允许池 + seed 采样 场景/光线/姿势/服装配色…
  → Face Blueprint 采样器（纯规则）  按 seed 采样脸型/眼型/眉型/肤色/特征 + 发型
  → 自洽审查 Coherence（DeepSeek）  检测内部打架并最小修正
  → Prompt Builder（DeepSeek，Face First）   写成 ≤150 字中文 Prompt，脸在最前
  → 即梦 Seedream（fal.ai）          出图
  → 本地保存
```

`--batch N` 时 Planner 整批只解析一次；**主题策略**：用户锁定主题（如「旗袍美女」）则全批固定，模糊输入（如「美女」）则按 `seed` 在 9 型主题上确定性轮换、张张不同主题。之后**每张按 `seed` 重新采样视觉骨架 + 人脸**再出图。差异化来自：主题轮换 + 主题视觉骨架（场景 / 光线 / 姿势 / 服装配色）+ 年龄 + 五维人脸采样 + 发型 + Face First。

## 技术栈

- **TypeScript / Node.js**（ESM）
- **DeepSeek**（`deepseek-chat` / V3，兼容 OpenAI SDK，负责 Planner / 自洽审查 / Prompt Builder 等文本环节）
- **主题视觉骨架引擎 + 规则化人脸采样**（纯逻辑、可复现，负责去同质化、保证组内多样）
- **字节即梦 Seedream**（经 [fal.ai](https://fal.ai) 接入，负责文生图）

## 安装

```bash
npm install
cp .env.example .env   # 按下表填入
```

## 配置 `.env`

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | ✅ | DeepSeek API key |
| `DEEPSEEK_BASE_URL` | | 默认 `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | | 默认 `deepseek-chat`（V3，不用 reasoner） |
| `FAL_KEY` | ✅ | fal.ai key，在 [dashboard/keys](https://fal.ai/dashboard/keys) 申请 |
| `FAL_MODEL` | ✅ | 即梦在 fal.ai 的 endpoint id，如 `fal-ai/bytedance/seedream/v4.5/text-to-image` |
| `FAL_IMAGE_SIZE` | | 默认 `portrait_4_3`；可选 `square_hd` / `portrait_16_9` / `auto_2K` / `auto_4K` 等 |

缺少必填 key 时启动会直接抛出清晰错误。

## 运行

```bash
# 只产出 Plan + 采样 + Prompt，不出图（不花钱，便于调试）
npm start "美女"

# 完整流程，调用即梦出图
npm start "美女" -- --image

# 模糊输入：逐张轮换不同主题，得一组多样的图
npm start "美女" -- --batch 6 --image

# 锁定主题：同主题下 N 个不同的人
npm start "旗袍美女" -- --batch 6 --image

# 打印每次大模型调用的完整输入/输出
npm start "美女" -- --debug
```

| 参数 | 说明 |
| --- | --- |
| `--image` | 调用即梦出图（不加则只产 Prompt，不花钱） |
| `--seed <n>` | 采样基准 seed（驱动主题轮换 + 人脸 + 年龄，可复现）；不传则随机 |
| `--batch <N>` | 生成 N 张，Planner 解析一次、每张按 seed 重新采样；锁定主题则同主题、模糊输入则轮换主题 |
| `--debug` | 打印 Planner / Builder 的完整 I/O（等价 `VD_DEBUG=1`） |

非人物输入（如 `一只猫`）会返回「暂不支持」。

## 输出

每张生成落在两级目录 `outputs/<日期>/<时间_短hash>/`（第一级按天归档，便于产线脚本按天取图；第二级是单张产物目录）：`image.png` / `visual-plan.json` / `coherence.json`（采样原值 + 自洽修正）/ `blueprint.json`（含 seed）/ `prompt.txt` / `meta.json` / `fal-request.json` / `fal-response.json`。不覆盖历史产物。

## ⚠️ 责任使用（Responsible Use）

本项目生成**写实的人物肖像**。使用即代表你同意：

- **仅限 18+**：默认不生成未成年形象（年龄下限锁 18）。请勿通过任何方式生成未成年人不当内容。
- **不得冒用真实人物**：不得用于生成可识别的真实人物肖像、深度伪造（deepfake）、或任何未经本人同意的肖像内容。
- **不得用于**：欺诈、骚扰、诽谤、误导性虚假信息，或所在司法辖区的任何违法用途。
- **合规自负**：生成内容的合法性与使用后果由使用者自行承担；作者不对滥用负责。

## 费用与第三方条款

- 运行**会产生 API 费用**：每次生成调用 DeepSeek（文本，便宜）；加 `--image` 时还会调用 fal.ai 出图（**按图计费**）。
- 你需遵守上游服务条款：[DeepSeek](https://platform.deepseek.com/)、[fal.ai](https://fal.ai/terms)、以及字节即梦 / Seedream 的使用条款。
- `.env` 内是你自己的付费密钥，已被 `.gitignore` 忽略，请勿提交或分享。

## Roadmap

- **v0.1（当前）** — 主题驱动多样性引擎：9 型美学主题 + 视觉骨架采样（场景 / 光线 / 姿势 / 服装）+ 规则化人脸采样 + 自洽审查 + Face First Prompt。解决「拍成什么样」。
- **v0.2** — Vision Critic：出图后视觉模型自动打分 / 查缺陷，闭环优化质量。
- **V2** — Identity Control：参考图 / img2img / IP-Adapter，解决「这个人长什么样」（身份级别的不同脸）。这会引入「一句话 + 参考图」的新输入形态。

> 设计取舍：纯文字 Prompt 对脸部几何的控制已到天花板，**不再增加鼻型/唇型/颧骨等字段**（即梦吃不进，只会撑长 Prompt）。下一步价值在 V2 的身份控制，而非继续扩字段。

## 项目结构

```text
src/
  main.ts               # CLI 入口（--image / --seed / --batch / --debug）
  planner.ts            # DeepSeek → 解析意图：主题 / pinned / extras
  pipeline.ts           # 单张编排：采样 → 自洽 → Builder → 出图 → 落地（runOne / runSamePrompt）
  diversity/
    themes.ts           # 9 型美学主题总表（主题 → 各视觉维度的允许池 + 权重）
    skeleton.ts         # 视觉骨架采样器（主题驱动，池内选 + history 防撞）
    pools.ts / history.ts / constraints.ts   # 维度池 / 跨次去重历史 / archetype 约束
  face/
    pools.ts            # 人脸/发型属性池 + 权重 + 约束 + archetype 偏置（纯数据）
    blueprint.ts        # 规则采样器：条件门控 + 互斥 + 反塌缩 + archetype 加权
    rng.ts              # 可复现随机源（mulberry32）+ 加权采样
  prompt-builder.ts     # 方案 → ≤150 字中文 Prompt（Face First，禁美化覆盖）
  coherence.ts          # 采样后自洽审查：检测内部打架并最小修正
  image-generator.ts    # Prompt → 即梦（fal.ai）→ 图片（含瞬时错误重试）
  caption.ts            # 一组图 → 配文（中英双版）
  storage.ts            # 本地保存
  config.ts / types.ts / debug.ts
  prompts/
    planner.system.md / builder.system.md / coherence.system.md
    caption.system.md / caption-title.system.md   # 各环节 system prompt
scripts/                # 产线脚本：daily / go / same / pick / pack / batch-themes …（每个脚本头部有用法注释）
test/                   # 单元测试（blueprint.test.ts / changes.test.ts，无需 API key）
docs/                   # 设计文档 + samples 样图
```

## 开发

```bash
npm run typecheck      # 类型检查
npm test               # 采样器单元测试（无需 API key）
npm run format         # Prettier 格式化
```

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

[MIT](LICENSE) © manxiaqu
