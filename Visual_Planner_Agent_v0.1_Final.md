# Visual Planner Agent v0.1（最终版）

## 一、项目定位

### 不做什么

第一阶段不要做：

- Character Diversity Agent
- Vision Critic
- 多 Agent
- LangGraph
- CrewAI
- ComfyUI 工作流
- 前端 SPA
- 数据库
- 用户系统
- 历史记忆系统
- 风格库
- 人物库

这些全部属于后续版本。

---

### 当前唯一目标

实现：

Visual Planner Agent v0.1

**题材范围：V0.1 仅支持人物生成**（风景 / 物品 / 场景类需求留到后续版本）。

解决问题：

用户不会描述图片需求。

例如：

用户输入：

生成一个美女

模型容易自由发挥：

- 长相不符合预期
- 风格不符合预期
- 构图随机
- 大量抽卡

Agent 负责：

把模糊需求变成高质量视觉方案。

---

# 二、MVP目标

实现最小闭环：

用户输入
↓
Visual Planner（一次 DeepSeek 调用，同时输出 Visual Plan + Prompt）
↓
图片生成
↓
结果保存

结束。

第一版到这里即可。

**说明**：

- Visual Plan 和 Prompt 在 v0.1 由**一次** DeepSeek 调用同时产出（JSON mode），不拆成两次 LLM 调用。
- **LLM 选 DeepSeek + 图片模型选字节即梦**：两端都是中文优化模型，链路全中文母语，避免中英互译的语义损耗。
- DeepSeek API **兼容 OpenAI SDK**，可直接用 `openai` npm 包改 `baseURL` 调用；模型用 `deepseek-chat`（V3）即可，不要用 `deepseek-reasoner`（R1）—— 推理模型对"按格式输出"反而会过度思考、变慢变贵。
- 未来若要同时支持英文图片模型（GPT-image / Midjourney），再把 Prompt 渲染从 Planner 拆成独立 Renderer 模块（按目标模型分叉），不放在 v0.1 范围。

---

# 三、验收标准

## 验收标准1

用户输入：

生成一个美女

Agent 能够输出**人物**结构化视觉方案。

例如：

```json
{
  "age": 22,
  "gender": "女",
  "temperament": "甜美",
  "face": "鹅蛋脸",
  "hair": "长直黑发",
  "clothes": "白色连衣裙",
  "scene": "夏日校园",
  "camera": "85mm 人像镜头",
  "lighting": "逆光"
}
```

V0.1 schema 字段（全部针对人物题材，**字段名英文便于代码处理，字段值统一中文**便于直接拼成中文 Prompt）：

- `age` — 年龄
- `gender` — 性别
- `temperament` — 气质
- `face` — 脸型 / 五官特征
- `hair` — 发型 / 发色
- `clothes` — 服装
- `scene` — 场景
- `camera` — 镜头 / 焦段
- `lighting` — 光线

非人物输入（如"一只猫" / "一辆车"）在 V0.1 阶段允许直接返回 "暂不支持" 并退出。

---

## 验收标准2

Agent 根据视觉方案生成 Prompt。

要求（可衡量）：

- **语言**：中文
- **形式**：自然语言段落（即梦的"母语"），**不允许** 英文 / 逗号 tag 拼接 / SD 风格关键词列表
- **长度**：60 - 120 字
- **维度覆盖**：必须覆盖 主体 / 场景 / 光线 / 镜头 / 氛围 至少 4 个维度
- **对比**：同一需求，用 **原始输入** 和 **优化后 Prompt** 各生成 3 张图，人工对比后优化版整体可控性更高

参考输出（"生成一个美女"）：

> 一位 22 岁的甜美女孩，鹅蛋脸，长直黑发，身穿白色连衣裙，置身夏日校园之中，85mm 人像镜头逆光拍摄，画面氛围温暖柔和。

V0.2 引入 Vision Critic 后改为自动评分。

---

## 验收标准3

Agent 调用图片 API。

**V0.1 固定使用字节即梦**（中文优化模型，与 Prompt 输出语言匹配）。

最终获得：

image.png

GPT-image / Midjourney 等英文模型留到后续版本，届时引入独立 Renderer 模块按目标模型分别渲染 Prompt。

---

## 验收标准4

Agent 保存：

- 原始需求
- Visual Plan
- Prompt
- 图片路径

到本地文件。

每次生成在 `outputs/` 下建独立子目录（如 `outputs/2026-05-29_143022_<short-hash>/`），避免覆盖历史。

---

# 四、技术方案

第一版：

- TypeScript
- Node.js
- **DeepSeek**（`deepseek-chat` / V3，Planner 一次调用产出 Plan + 中文 Prompt；通过 `openai` SDK + 自定义 `baseURL` 调用）
- **字节即梦**（图片生成，中文优化模型）

不引入复杂框架。多图片模型 / 多 LLM 支持留到后续版本。

---

# 五、项目结构

```text
src/
  main.ts               # CLI 入口
  planner.ts            # 一次 Claude 调用，同时输出 Visual Plan 和 Prompt
  image-generator.ts    # 调用图片 API
  storage.ts            # 保存结果
  config.ts             # API key / 模型 / 默认参数
  types.ts              # Visual Plan / Prompt / 输出结构 等类型
  prompts/
    planner.system.md   # Planner 的 system prompt，单独管理便于迭代

.env                    # CLAUDE_API_KEY / IMAGE_API_KEY
outputs/                # 每次生成一个独立子目录
```

---

# 六、模块职责

## planner.ts

职责：

将模糊的**人物**需求一次性转换成结构化视觉方案 + 最终 Prompt（针对即梦）。

输入：

生成一个美女

输出：

```ts
{
  plan: VisualPlan,   // 见验收标准1 的 JSON，字段值统一中文
  prompt: string,     // 60-120 字中文自然语言段落，直接喂给即梦
}
```

实现方式：

一次 DeepSeek 调用（`deepseek-chat`）+ JSON mode（`response_format: { type: "json_object" }`），同时返回 `plan` 和 `prompt`。

system prompt 中明确要求：

- 返回**严格 JSON**，顶层结构 `{ "plan": {...}, "prompt": "..." }`
- `plan` 所有字段值必须中文
- `prompt` 必须中文自然语言段落，禁止英文、禁止逗号 tag 拼接

容错：DeepSeek JSON mode 偶发输出非法 JSON，加一次 parse 失败重试即可（重试时把上一轮非法输出回灌作为反例）。

---

## image-generator.ts

职责：

调用图片模型。

输入：

Prompt

输出：

图片

---

## storage.ts

职责：

保存结果。

保存：

- visual-plan.json
- prompt.txt
- image.png

---

# 七、开发步骤

## Step0（先打通最易卡链路）

硬编码一个 Visual Plan 和 Prompt，直接调图片 API 跑出 `image.png` 并存到 `outputs/`。

目的：先把**图片 API + storage** 这条最容易卡（API key 申请、SDK 调用、文件落地）的链路打通，避免写完 Planner 才发现 API 用不了。

---

## Step1

创建 CLI 项目（单次执行 + 命令行参数，**不做 REPL**）。

例如：

```
npm start "生成一个美女"
```

读取 `argv`，传给后续模块。

---

## Step2

实现 Planner。

一次 Claude 调用同时输出 `plan` + `prompt`。

system prompt 放在 `src/prompts/planner.system.md` 单独迭代。

---

## Step3

串联 Planner → image-generator → storage，跑通端到端。

控制台打印中间结果（Visual Plan + Prompt），方便人工对比验收。

---

## Step4

打磨 Planner 的 system prompt，让输出满足验收标准 1、2。

完成 MVP。

---

# 八、后续演进路线

## v0.2

Vision Critic

流程：

用户
↓
Planner
↓
Prompt
↓
图片
↓
Vision分析

---

## v0.3

Prompt Refiner

流程：

图片
↓
Vision分析
↓
Prompt优化
↓
重新生成

---

## v0.4

Character Diversity Agent

解决：

批量生成美女时人物同质化问题。

实现：

- 年龄规划
- 脸型规划
- 发型规划
- 气质规划

保证人物差异化。

---

# 九、当前阶段结论

当前不要继续研究：

- Aider
- Cursor
- LangGraph

当前直接进入：

Visual Planner Agent v0.1 开发阶段。

目标：

本周跑通第一版 Agent Loop：

用户需求
↓
Visual Plan
↓
Prompt
↓
图片
↓
保存结果
