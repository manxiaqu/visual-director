# 贡献指南

感谢你对 Visual Director 的关注！这是一个早期实验性项目，欢迎 issue、讨论与 PR。

## 开发环境

```bash
npm install
cp .env.example .env   # 填入 DEEPSEEK_API_KEY / FAL_KEY 等
```

> 注意：运行出图会调用 DeepSeek 与 fal.ai，**产生 API 费用**。开发逻辑时可不加 `--image`，只验证 Plan/Prompt，不出图、不花钱。

## 提交前自检

```bash
npm run typecheck     # 类型检查
npm test              # 采样器单元测试（无需 API key）
npm run format:check  # 代码格式检查
npm run format        # 自动格式化
```

CI 会跑以上检查，请保证本地通过。

## 代码风格

- TypeScript / Node.js，ESM。
- 缩进 2 空格，单引号，不加分号，行宽 ≤120，对象/数组尾随逗号。
- 格式交给 Prettier（`npm run format`），不要手动纠结排版。

## 改 Prompt / 采样规则

- Planner / Builder 的 system prompt 在 [src/prompts/](src/prompts/)，可直接迭代（运行时每次读取，无需重启）。
- 人脸采样的属性池与权重在 [src/face/pools.ts](src/face/pools.ts)（纯数据），采样逻辑在 [blueprint.ts](src/face/blueprint.ts)。改了采样逻辑请补/更新 [test/blueprint.test.ts](test/blueprint.test.ts)。

## 范围约定

当前聚焦 v0.1（详见 [README](README.md) 的 Roadmap）。身份级别的"不同脸"（参考图 / img2img / IP-Adapter）属于 V2，欢迎讨论但暂不并入主线。

## 提 PR

1. 从 `main` 切分支。
2. 一个 PR 聚焦一件事，commit message 用约定式（`feat:` / `fix:` / `docs:` / `chore:` …）。
3. 描述清楚动机与影响，关联相关 issue。
