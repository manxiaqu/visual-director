# Visual Director

把模糊的图片需求转化为高质量视觉方案的 Agent。

核心问题：用户不擅长描述图片需求（如"生成一个美女"），模型自由发挥导致结果不可控。
解决方式：用一次 DeepSeek 调用把模糊需求结构化为 Visual Plan 并产出一段中文 Prompt，再经 Refiner 润色措辞，最后调字节即梦生成图片。

> **v0.1（MVP）说明**
> - **仅支持人物题材**。风景 / 物品 / 动物 / 场景等非人物输入会返回"暂不支持"。
> - **图片模型固定为字节即梦 Seedream**（经 fal.ai 接入），Prompt 按即梦母语组织 —— 60-120 字中文自然语言段落，而非英文 tag 拼接。

---

## 链路

```
用户输入 → Planner（DeepSeek 产出 Plan + 中文 Prompt） → Refiner（DeepSeek 润色措辞） → 即梦 Seedream（fal.ai） → 本地保存
```

## 技术栈

- **TypeScript / Node.js**
- **DeepSeek**（`deepseek-chat` / V3，兼容 OpenAI SDK，负责 Planner 与 Refiner）
- **字节即梦 Seedream**（经 [fal.ai](https://fal.ai) 接入，负责文生图）

## 安装

```bash
npm install
```

## 配置 `.env`

复制 `.env.example` 为 `.env` 并填入（取值以 `.env.example` 为准）：

```bash
cp .env.example .env
```

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | ✅ | DeepSeek API key |
| `DEEPSEEK_BASE_URL` | | 默认 `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | | 默认 `deepseek-chat`（V3，**不用** reasoner） |
| `FAL_KEY` | ✅ | fal.ai key，在 [dashboard/keys](https://fal.ai/dashboard/keys) 申请 |
| `FAL_MODEL` | ✅ | 即梦在 fal.ai 的 endpoint id，如 `fal-ai/bytedance/seedream/v4.5/text-to-image` |
| `FAL_IMAGE_SIZE` | | 默认 `portrait_16_9`；可选 `square_hd` / `square` / `portrait_4_3` / `portrait_16_9` / `landscape_4_3` / `landscape_16_9` / `auto_2K` / `auto_4K` |

缺少必填 key 时启动会直接抛出清晰错误。

## 运行

```bash
npm start "生成一个美女"
```

- 人物输入：打印 Visual Plan 与优化 Prompt，生成图片并落地。
- 非人物输入（如 `一只猫`）：打印"暂不支持"并退出。

仅验证图片链路（硬编码 Prompt，跳过 Planner）：

```bash
npm run smoke:image
```

类型检查：

```bash
npm run typecheck
```

## 输出位置

每次生成在 `outputs/` 下创建独立子目录 `YYYY-MM-DD_HHmmss_<短hash>/`，包含：

| 文件 | 内容 |
| --- | --- |
| `image.png` | 生成的图片（出图时） |
| `visual-plan.json` | 结构化 Visual Plan（字段值为中文） |
| `prompt.raw.txt` | Planner 产出的原始中文 Prompt |
| `prompt.txt` | Refiner 润色后的中文 Prompt（实际喂给即梦） |
| `negative-prompt.txt` | 负面提示词（如有；即梦 4.5 实际不接受该参数，仅作记录） |
| `fal-request.json` | 实际发送给 fal.ai 的请求参数（出图时） |
| `fal-response.json` | fal.ai 返回的完整结果，含 seed（出图时） |
| `meta.json` | 原始需求 / 时间戳 / Plan / Prompt / 模型 / seed / 来源 URL 等汇总 |

不会覆盖历史产物。

## 项目结构

```text
src/
  main.ts               # CLI 入口，串联完整流程
  planner.ts            # 一次 DeepSeek 调用产出 Plan + 中文 Prompt（含 JSON 解析失败重试一次）
  refiner.ts            # 对 Prompt 再做一次中文措辞润色（只顺不加长）
  image-generator.ts    # 中文 Prompt → 即梦（fal.ai）→ 图片字节
  storage.ts            # 本地保存
  config.ts             # 环境变量加载与校验
  types.ts
  prompts/
    planner.system.md   # Planner system prompt，单独管理便于迭代
    refiner.system.md   # Refiner system prompt
scripts/
  smoke-image.ts        # Step 0 图片链路冒烟脚本
outputs/                # 生成产物
```

## License

[MIT](LICENSE) © manxiaqu
