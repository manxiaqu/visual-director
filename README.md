# Visual Director

> **Portrait Director Agent** — 把一句话需求转成结构化的人物身份方案，再生成高质量中文 Prompt 出图。

输入一句模糊的话（如「高知女性」），Agent 自动规划出人物的**身份 / 职业 / 年龄 / 场景 / 服装配色 / 风格**，并产出适配字节即梦（Seedream）的中文 Prompt，最后出图。它解决的是「**这个人是谁、做什么、在哪、怎么拍**」，让一句话变成一组**身份各异**的人物，而不是千篇一律的网红脸。

> **状态：早期实验项目（v0.1 · experimental）** — 核心链路已跑通，欢迎试用与 issue 反馈。它擅长「身份 / 职业 / 场景 / 风格」的差异化；**脸部身份级控制（V2）** 与 **出图质量闭环（Vision Critic, v0.2）** 仍在 [Roadmap](#roadmap) 上。

## 效果示例

输入 `高知女性`，一次生成 9 种不同职业身份：

<table>
  <tr>
    <td align="center"><img src="docs/samples/01_teacher.jpg" width="200"><br>大学教师</td>
    <td align="center"><img src="docs/samples/02_scientist.jpg" width="200"><br>科研人员</td>
    <td align="center"><img src="docs/samples/03_doctor.jpg" width="200"><br>主治医师</td>
  </tr>
  <tr>
    <td align="center"><img src="docs/samples/04_lawyer.jpg" width="200"><br>律师</td>
    <td align="center"><img src="docs/samples/05_editor.jpg" width="200"><br>出版社编辑</td>
    <td align="center"><img src="docs/samples/06_architect.jpg" width="200"><br>建筑师</td>
  </tr>
  <tr>
    <td align="center"><img src="docs/samples/07_counselor.jpg" width="200"><br>心理咨询师</td>
    <td align="center"><img src="docs/samples/08_curator.jpg" width="200"><br>策展人</td>
    <td align="center"><img src="docs/samples/09_director.jpg" width="200"><br>品牌总监</td>
  </tr>
</table>

```bash
npm start "高知女性" -- --batch 9 --image \
  --occupations "大学教师,科研人员,医生,律师,出版社编辑,建筑师,心理咨询师,策展人,品牌总监"
```

换个题材，输入 `御姐`，同样产出一组不同身份：

<table>
  <tr>
    <td align="center"><img src="docs/samples/yujie_1_blogger.jpg" width="200"><br>穿搭博主</td>
    <td align="center"><img src="docs/samples/yujie_2_stylist.jpg" width="200"><br>时尚搭配师</td>
    <td align="center"><img src="docs/samples/yujie_3_lawyer.jpg" width="200"><br>律师</td>
  </tr>
  <tr>
    <td align="center"><img src="docs/samples/yujie_4_director.jpg" width="200"><br>品牌总监</td>
    <td align="center"><img src="docs/samples/yujie_5_executive.jpg" width="200"><br>企业高管</td>
    <td align="center"><img src="docs/samples/yujie_6_designer.jpg" width="200"><br>造型师</td>
  </tr>
</table>

## 擅长 / 不擅长（重要，先说清楚）

| 擅长 ✅ | 不擅长 ❌ |
| --- | --- |
| 把模糊需求规划成具体**身份 / 职业 / 场景 / 风格** | 让同一组图里的**脸是身份级别的不同人** |
| 用**职业 / 年龄 / 服装配色 / 发型**拉开人物差异 | 精确控制脸型 / 眼型等五官几何 |
| 全链路中文、可控、可复现采样 | 风景 / 物品 / 多人群像等非人物题材 |

> 诚实说明：纯文生图（即梦/Seedream）对**脸部几何**的控制力有限——会回归它自己的"漂亮脸"先验。本项目用规则采样 + Face First Prompt 把差异尽可能传递给模型，但要做到「身份级别的不同脸」，需要参考图 / img2img / 身份控制（见 [Roadmap](#roadmap)，V2）。

## 链路

```
一句话
  → Planner（DeepSeek）       规划身份/职业/年龄/服装配色/场景/风格
  → Face Blueprint 采样器（纯规则）   按 seed 采样脸型/眼型/眉型/肤色/特征 + 发型
  → Prompt Builder（DeepSeek，Face First）   写成 ≤150 字中文 Prompt，脸在最前
  → 即梦 Seedream（fal.ai）    出图
  → 本地保存
```

`--batch N` 时每张**完整重走一遍**（重新规划 → 采样 → 出图），得到同主题下 N 个不同的人。差异化来自：职业子类型 + 年龄 + 服装配色 + 五维人脸采样 + 发型 + Face First。

## 技术栈

- **TypeScript / Node.js**（ESM）
- **DeepSeek**（`deepseek-chat` / V3，兼容 OpenAI SDK，负责 Planner 与 Prompt Builder）
- **规则化人脸采样**（纯逻辑、可复现，负责去同质化）
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
npm start "高知女性"

# 完整流程，调用即梦出图
npm start "高知女性" -- --image

# 一组不同身份（每张重新规划），并出图
npm start "高知女性" -- --batch 9 --image

# 指定一组职业，逐张强制铺开（README 那组就是这么跑的）
npm start "高知女性" -- --batch 9 --image --occupations "大学教师,医生,律师,建筑师,编辑,策展人,品牌总监,科研人员,心理咨询师"

# 打印每次大模型调用的完整输入/输出
npm start "高知女性" -- --debug
```

| 参数 | 说明 |
| --- | --- |
| `--image` | 调用即梦出图（不加则只产 Prompt，不花钱） |
| `--seed <n>` | 人脸采样基准 seed（可复现）；不传则随机 |
| `--batch <N>` | 生成 N 个，每张完整重走一遍，得同主题下 N 个不同的人 |
| `--occupations "a,b,c"` | batch 时逐张强制指定职业，铺开身份差异 |
| `--debug` | 打印 Planner / Builder 的完整 I/O（等价 `VD_DEBUG=1`） |

非人物输入（如 `一只猫`）会返回「暂不支持」。

## 输出

每次生成在 `outputs/` 下创建独立子目录 `YYYY-MM-DD_HHmmss_<短hash>/`：`image.png` / `visual-plan.json` / `blueprint.json`（含 seed）/ `prompt.txt` / `meta.json` / `fal-request.json` / `fal-response.json`。不覆盖历史产物。

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

- **v0.1（当前）** — Portrait Director：身份 / 职业 / 场景 / 风格规划 + 规则化人脸采样 + Face First Prompt。解决「这个人是谁」。
- **v0.2** — Vision Critic：出图后视觉模型自动打分 / 查缺陷，闭环优化质量。
- **V2** — Identity Control：参考图 / img2img / IP-Adapter，解决「这个人长什么样」（身份级别的不同脸）。这会引入「一句话 + 参考图」的新输入形态。

> 设计取舍：纯文字 Prompt 对脸部几何的控制已到天花板，**不再增加鼻型/唇型/颧骨等字段**（即梦吃不进，只会撑长 Prompt）。下一步价值在 V2 的身份控制，而非继续扩字段。

## 项目结构

```text
src/
  main.ts               # CLI 入口（--image / --seed / --batch / --occupations / --debug）
  planner.ts            # DeepSeek → 核心 Plan（身份/职业/年龄/配色/场景…）
  face/
    pools.ts            # 人脸/发型属性池 + 权重 + 约束 + archetype 偏置（纯数据）
    blueprint.ts        # 规则采样器：条件门控 + 互斥 + 反塌缩 + archetype 加权
    rng.ts              # 可复现随机源（mulberry32）+ 加权采样
  prompt-builder.ts     # 方案 → ≤150 字中文 Prompt（Face First，禁美化覆盖）
  image-generator.ts    # Prompt → 即梦（fal.ai）→ 图片（含瞬时错误重试）
  storage.ts            # 本地保存
  config.ts / types.ts / debug.ts
  prompts/
    planner.system.md   # Planner system prompt
    builder.system.md   # Prompt Builder system prompt
test/blueprint.test.ts  # 采样器单元测试
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
