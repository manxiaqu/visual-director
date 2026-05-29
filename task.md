# Visual Planner Agent v0.1 任务拆分

> 源文档：[Visual_Planner_Agent_v0.1_Final.md](Visual_Planner_Agent_v0.1_Final.md)
>
> 拆分原则：按文档第七节"开发步骤"顺序展开，每个任务标注 **输入 / 产出 / 验收点**，可独立提交并验证。
>
> 状态标记：`[ ]` 未开始 / `[~]` 进行中 / `[x]` 已完成

---

## T0. 项目初始化与脚手架

### T0.1 初始化 Node + TypeScript 项目

- [x] `npm init -y`，写入 `package.json`（`type: module`，`scripts.start` 指向 `tsx src/main.ts`）
- [x] 装依赖：`openai`、`dotenv`、`tsx`、`typescript`、`@types/node`
- [x] 写 `tsconfig.json`（`target: ES2022`、`module: ESNext`、`moduleResolution: bundler`、`strict: true`、`outDir: dist`）
- [x] 写 `.gitignore`：`node_modules / dist / .env / outputs/`

**产出**：`package.json` / `tsconfig.json` / `.gitignore`
**验收**：`npx tsc --noEmit` 通过；`npm start` 能跑空入口不报错

### T0.2 建立目录骨架与类型定义

- [x] 创建 [src/](src/)、[src/prompts/](src/prompts/)、[outputs/](outputs/)（带 `.gitkeep`）
- [x] [src/types.ts](src/types.ts)：定义 `VisualPlan`（9 个字段，值为 string，`age` 为 number）、`PlannerOutput`（`{ plan, prompt }`）、`GenerationResult`（包含原始 input / plan / prompt / imagePath）
- [x] [src/config.ts](src/config.ts)：用 `dotenv` 加载 `.env`，导出 `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL`（`https://api.deepseek.com`）/ `DEEPSEEK_MODEL`（`deepseek-chat`）/ `JIMENG_API_KEY` 等常量；缺失 key 时启动即抛错
- [x] 写 `.env.example`，列出所需环境变量

**产出**：目录结构 + [src/types.ts](src/types.ts) + [src/config.ts](src/config.ts) + `.env.example`
**验收**：`import` 类型与 config 在其他模块可用，缺 key 启动报清晰错误

---

## T1. Step 0 — 打通即梦 + storage 最易卡链路

> 目的：在写 Planner 之前先验证 API key、SDK 调用、文件落地能跑通；避免最后一步才发现 API 用不了。

### T1.1 调研字节即梦 API 接入方式

- [ ] 确认即梦 API 文档（鉴权方式 / endpoint / 请求体 / 返回格式 / 是否异步轮询）
- [ ] 申请并配置 `JIMENG_API_KEY` 到本地 `.env`
- [ ] 记录关键信息（同步 / 异步、图片返回是 URL 还是 base64、是否要轮询 task_id）写入本文件 T1.1 下方备注

**产出**：本地 `.env` 可用；备注写明接入要点
**验收**：能用 `curl` 或最小脚本调通一次拿到图片

> **接入要点备注（已确定选型，待真实 key 验证）**：
> - 即梦官方 API 接入门槛较高，v0.1 改走 **fal.ai 托管的 ByteDance Seedream**（即梦底层模型），用 `@fal-ai/client` 调用。
> - 鉴权：`FAL_KEY`（在 https://fal.ai/dashboard/keys 申请），`fal.config({ credentials })`。
> - 调用：`fal.subscribe(FAL_MODEL, { input: { prompt, image_size } })`，**轮询由 SDK 内部处理**，无需手写 task_id 轮询。
> - 返回：`data.images[0].url`（图片为 **URL**，需再 `fetch` 下载成 bytes 落地），非 base64。
> - `FAL_MODEL` 例：`fal-ai/bytedance/seedream/v3/text-to-image`，以 fal.ai 文档实际为准。
> - ⚠️ 与 CLAUDE.md「固定使用字节即梦官方 API」字面有偏差，已用 Seedream 替代，待确认。

### T1.2 实现 image-generator 最小版

- [x] [src/image-generator.ts](src/image-generator.ts)：导出 `generateImage(prompt: string): Promise<GeneratedImage>`（返回图片 bytes + contentType + sourceUrl，走 fal.ai 托管的 ByteDance Seedream）
- [x] 异步任务场景：用 `fal.subscribe` 由 SDK 内部处理轮询；返回未含图片 URL 或下载失败时抛错
- [x] 不做 prompt 加工，原样透传

**产出**：[src/image-generator.ts](src/image-generator.ts)
**验收**：单测脚本传入硬编码中文 prompt，能返回非空图片字节

### T1.3 实现 storage 最小版

- [x] [src/storage.ts](src/storage.ts)：导出 `createRunDir()`（返回 `outputs/YYYY-MM-DD_HHmmss_<short-hash>/` 路径）、`saveImage(dir, bytes)`、`saveJson(dir, name, obj)`、`saveText(dir, name, text)`
- [x] 短 hash 用 `crypto.randomBytes(3).toString('hex')`，避免同秒冲突
- [x] 目录不存在则递归创建

**产出**：[src/storage.ts](src/storage.ts)
**验收**：调用 `createRunDir` + `saveImage` 后，`outputs/` 下出现独立子目录与 `image.png`

### T1.4 Step 0 联调脚本

- [ ] 临时入口（可放 [src/main.ts](src/main.ts) 第一版）：硬编码 prompt（例如文档示例那段 60-120 字）→ 调 image-generator → storage 落地
- [ ] 控制台打印输出目录路径

**产出**：可运行的最小闭环
**验收**：`npm start` 后 `outputs/` 下出现 `image.png`，肉眼看图与 prompt 大致相符 → **Step 0 通过**

---

## T2. Step 1 — CLI 入口

### T2.1 CLI 参数解析

- [x] [src/main.ts](src/main.ts) 改造：从 `process.argv` 读取第一个位置参数作为用户原始需求
- [x] 缺参数时打印 usage 并退出（`npm start "生成一个美女"`）
- [x] 不引入 commander/yargs 等库，手写解析即可

**产出**：[src/main.ts](src/main.ts) CLI 框架
**验收**：`npm start "生成一个美女"` 能在控制台打印接收到的原始需求

---

## T3. Step 2 — Planner（DeepSeek 一次调用产出 Plan + Prompt）

### T3.1 编写 Planner system prompt

- [x] [src/prompts/planner.system.md](src/prompts/planner.system.md)：起草 system prompt，要点：
  - 角色：视觉方案规划师，仅处理**人物**题材
  - 输出严格 JSON：`{ "plan": {...9 字段}, "prompt": "..." }`
  - `plan` 字段：`age`(number) / `gender` / `temperament` / `face` / `hair` / `clothes` / `scene` / `camera` / `lighting`，**字段值全部中文**
  - `prompt`：60-120 字中文自然语言段落，覆盖 主体 / 场景 / 光线 / 镜头 / 氛围 至少 4 维，**禁止英文、禁止逗号 tag 拼接**
  - 非人物输入：返回 `{ "unsupported": true, "reason": "..." }`
  - 给 1-2 个 few-shot（如"生成一个美女"对应文档参考输出）
- [x] 在代码中通过 `fs.readFileSync` 读取此文件，便于不重启迭代

**产出**：[src/prompts/planner.system.md](src/prompts/planner.system.md)
**验收**：人工读 prompt 逻辑自洽，约束明确

### T3.2 实现 planner.ts

- [x] [src/planner.ts](src/planner.ts)：导出 `plan(userInput: string): Promise<PlannerOutput | { unsupported: true; reason: string }>`
- [x] 用 `openai` SDK，构造方式：`new OpenAI({ apiKey: DEEPSEEK_API_KEY, baseURL: DEEPSEEK_BASE_URL })`
- [x] 调用 `chat.completions.create`：`model: 'deepseek-chat'`、`response_format: { type: 'json_object' }`、`temperature: 0.7`（可调）
- [x] messages：system（读 md）+ user（原始输入）
- [x] 解析 JSON；区分"非人物 unsupported"与"合法 plan+prompt"两种返回

**产出**：[src/planner.ts](src/planner.ts)
**验收**：输入"生成一个美女"返回合法 `PlannerOutput`；输入"一只猫"返回 `unsupported`

### T3.3 JSON parse 失败重试

- [x] parse 失败时再调一次 DeepSeek，把上一轮非法输出 + 错误信息回灌作为 user message，要求严格 JSON 重出
- [x] 仅重试 1 次，仍失败抛错向上传

**产出**：合并进 [src/planner.ts](src/planner.ts)
**验收**：人工注入非法 JSON 模拟一次，观察重试触发并恢复

---

## T4. Step 3 — 端到端串联

### T4.1 main.ts 串联完整流程

- [x] [src/main.ts](src/main.ts) 重写为完整流程：
  1. 读 CLI 参数
  2. 调 `plan()`；若 `unsupported` 直接打印"暂不支持"退出
  3. 控制台打印 `VisualPlan`（JSON 缩进）与 `prompt`（便于人工对比）
  4. 调 `generateImage(prompt)`
  5. 调 `storage` 落地：`createRunDir` → 保存 `visual-plan.json` / `prompt.txt` / `image.png` / `meta.json`（含原始输入、时间戳）
  6. 打印输出目录绝对路径

**产出**：完整的 [src/main.ts](src/main.ts)
**验收**：`npm start "生成一个美女"` 一条命令产出包含 4 个文件的子目录

### T4.2 端到端冒烟测试

- [ ] 跑 3 个典型输入：
  - 人物模糊：`生成一个美女`
  - 人物较具体：`一个穿汉服的少年`
  - 非人物：`一只猫`（应触发 unsupported）
- [ ] 检查每次输出目录内容齐全、文件可打开

**产出**：跑通记录（可在 task.md 此处简短备注每次输出目录）
**验收**：3 个 case 均符合预期 → **MVP 端到端通**

---

## T5. Step 4 — 打磨 system prompt 至满足验收标准

### T5.1 验收标准 1（结构化 Plan）

- [ ] 准备 5-10 个人物题材模糊输入（如"霸总" / "学院风女生" / "中年医生"等）
- [ ] 每个跑一次，检查 9 个字段：是否齐全、是否全中文、是否合理
- [ ] 不达标处反推回 system prompt 加约束 / few-shot，迭代

**产出**：测试用例记录 + system prompt 更新
**验收**：10 条人物输入 9/10 字段齐全且全中文

### T5.2 验收标准 2（Prompt 质量）

- [ ] 校验 prompt：60-120 字、无英文、无逗号 tag、覆盖 主体/场景/光线/镜头/氛围 ≥4 维
- [ ] 字数不符或漏维度时回到 system prompt 调整
- [ ] 选 2-3 个需求，原始输入 vs 优化 prompt 各跑 3 张图，人工对比可控性

**产出**：对比图样本（可放在 `outputs/` 下并在此记录子目录名）
**验收**：人工评估优化版整体可控性更高

### T5.3 验收标准 3 & 4 回归

- [ ] 即梦 API 接入稳定（T1 已验证，跑 T5.2 时顺带回归）
- [ ] 每次生成产出独立子目录，包含原始需求 / Plan / Prompt / 图片，无覆盖

**产出**：—
**验收**：随机抽 3 次产物完整无缺

---

## T6. 收尾

### T6.1 README

- [x] 写 `README.md`：安装、配置 `.env`、运行示例、输出位置说明
- [x] 注明 v0.1 仅支持人物题材、固定即梦

### T6.2 自查清单

- [ ] 4 条验收标准逐条勾选通过
- [ ] 代码遵守 [CLAUDE.md](CLAUDE.md) 规范（2 空格缩进 / 单引号 / 无分号 / 尾逗号 / 120 列）
- [ ] `.env` 不入库；`outputs/` 不入库
- [ ] 无 LangGraph / CrewAI / 数据库 等 v0.1 不做项混入

---

## 任务依赖关系

```
T0 ──> T1 ──> T2 ──> T3 ──> T4 ──> T5 ──> T6
       (Step0)(Step1)(Step2)(Step3)(Step4)(收尾)
```

- T0 是其他所有任务的前置
- T1（Step 0 打通即梦）必须早于 T3（Planner），避免做完 Planner 才发现图片 API 不通
- T3 可在 T1 完成后并行起草 prompt（T3.1），但联调要在 T2 之后
- T5 依赖 T4 跑通的端到端
