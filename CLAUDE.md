# Visual Director

## 项目概述

Visual Director 是一个将模糊的图片生成需求转化为高质量视觉方案的 Agent 项目。

核心问题：用户不擅长描述图片需求（例如"生成一个美女"），导致模型自由发挥，结果不可控。

解决方式：通过 Agent 把模糊需求结构化为视觉方案，再生成高质量 Prompt，最终调用图片模型产出图片。

详见 [Visual_Planner_Agent_v0.1_Final.md](Visual_Planner_Agent_v0.1_Final.md)。

---

## 当前阶段

**Visual Planner Agent v0.1（MVP）**

**题材范围：仅支持人物生成**。非人物输入（风景 / 物品 / 场景）允许直接返回 "暂不支持"。

**图片模型：固定使用字节即梦**（中文优化模型）。Prompt 按即梦的"母语"组织 —— 中文自然语言段落，不是英文 tag 拼接。

最小闭环：

```
用户输入 → Visual Planner（一次 DeepSeek 调用同时产出 Plan + 中文 Prompt） → 即梦 → 结果保存
```

- **LLM 选 DeepSeek + 图片模型选即梦**：两端都是中文优化模型，全链路中文母语，避免中英互译的语义损耗。
- DeepSeek API **兼容 OpenAI SDK**，用 `openai` npm 包改 `baseURL` 调用；模型用 `deepseek-chat`（V3），**不用** `deepseek-reasoner`（推理模型对格式输出会过度思考、变慢变贵）。
- Plan 和 Prompt **不拆成两次 LLM 调用**，等出现"结构化"和"措辞"需要不同模型 / 温度时再拆。
- 未来若要同时支持英文图片模型（GPT-image / Midjourney），再拆出独立 Renderer 模块按目标模型分别渲染 Prompt（不在 v0.1 范围）。

### 第一版不做

- Character Diversity Agent
- Vision Critic
- 多 Agent / LangGraph / CrewAI
- ComfyUI 工作流
- 前端 SPA
- 数据库 / 用户系统 / 历史记忆 / 风格库 / 人物库
- 非人物题材（风景 / 物品 / 场景）
- REPL 交互（V0.1 用单次执行 + 命令行参数）

---

## 技术栈

- TypeScript
- Node.js
- **DeepSeek**（`deepseek-chat` / V3，Planner 一次调用产出 Plan + 中文 Prompt；通过 `openai` SDK + 自定义 `baseURL` 调用）
- **字节即梦**（图片生成，中文优化模型）

不引入复杂框架。多 LLM / 多图片模型支持留到后续版本。

---

## 项目结构

```text
src/
  main.ts               # CLI 入口（单次执行 + 命令行参数）
  planner.ts            # 一次 DeepSeek 调用，同时输出 Visual Plan 和中文 Prompt
  image-generator.ts    # Prompt → 图片
  storage.ts            # 保存结果
  config.ts             # API key / 模型 / 默认参数
  types.ts
  prompts/
    planner.system.md   # Planner system prompt，单独管理便于迭代

.env                    # DEEPSEEK_API_KEY / JIMENG_API_KEY
outputs/                # 每次生成一个独立子目录（时间戳 + 短 hash）
```

---

## 模块职责

| 模块 | 输入 | 输出 |
| --- | --- | --- |
| `planner.ts` | 用户原始需求（人物） | `{ plan: VisualPlan（字段值中文）, prompt: string（60-120 字中文段落） }`，一次 DeepSeek 调用 + JSON mode |
| `image-generator.ts` | 中文 Prompt | 调即梦 → image.png |
| `storage.ts` | 上述全部 | 本地文件 |

---

## 验收标准

1. 能将"生成一个美女"等**人物**模糊输入转为结构化 Visual Plan JSON（age / gender / temperament / face / hair / clothes / scene / camera / lighting，**字段值统一中文**）。非人物输入返回"暂不支持"。
2. 优化后 Prompt 为 **60-120 字中文自然语言段落**（禁止英文、禁止逗号 tag 拼接），覆盖 主体 / 场景 / 光线 / 镜头 / 氛围 至少 4 个维度；同一需求用原始 vs 优化各生成 3 张图，人工对比优化版整体可控性更高。
3. 接入字节即梦 API，能产出 image.png。
4. 本地保存：原始需求、Visual Plan、Prompt、图片路径，每次生成独立子目录。

---

## 开发步骤

0. **先打通最易卡链路**：硬编码一个中文 Prompt，直接调即梦 API 跑出 image.png 并落地，验证 API key + SDK + storage 链路通畅
1. 创建 CLI 项目（单次执行 + 命令行参数，无 REPL）
2. 实现 Planner（一次 DeepSeek 调用 + JSON mode 同时输出 Plan + 中文 Prompt，system prompt 放 `src/prompts/`，明确禁止英文输出；加 JSON parse 失败重试一次）
3. 串联 Planner → image-generator（即梦）→ storage，控制台打印中间结果
4. 打磨 system prompt，让输出满足验收标准 1、2，完成 MVP

---

## 后续演进

- **v0.2** — Vision Critic：图片生成后做视觉分析
- **v0.3** — Prompt Refiner：基于 Vision 分析优化 Prompt 并重生成
- **v0.4** — Character Diversity Agent：解决批量生成人物同质化问题

---

## 代码规范

TypeScript / Node.js 部分遵循：

- 缩进：2 个空格
- 单行最大宽度：120 字符
- 字符串：单引号
- 语句末尾：不加分号
- 对象/数组末尾元素：加尾逗号

---

## 注意事项

- 当前阶段不研究 Aider / Cursor / LangGraph，专注跑通 v0.1 Agent Loop
- 不引入数据库、用户系统、复杂框架
- 优先完成端到端最小闭环，再迭代质量
