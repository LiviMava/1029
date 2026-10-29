# 一笔订单，讲清企业 RAG

入口：http://127.0.0.1:8090/tutorial.html 。原有文档解析、分块、向量实验保留在 `/document-tutorial.html`。

## 开场：为什么需要检索

先问听众：“我的订单 123 现在能退货吗？如果可以，该怎么操作？”

模型参数里没有这笔订单的当前状态。把所有企业资料塞进上下文，也解决不了权限、过期政策、实时事实和来源问题。上下文窗口有限，注意力计算的成本也是原因之一，但不要把“需要检索”简化成“注意力机制记不住”。检索的任务是选出当前用户、当前问题需要且适用的证据。

本教程使用固定教学日期 **2026-10-28**，不会随演讲日期漂移。订单、政策和物流状态全部虚构；H2 SQL、HTTP、Lucene、云端模型和 Qdrant 调用真实运行。这里的欧洲政策也只是虚构教学规则，不代表法律。

## 讲述顺序与应用边界

左边按 5 个阶段展示 12 步：**原始文档 → 离线准备 → ① 取业务事实 → ② 筛政策 + 检索条款 → ③ 判断 + 回答**。点任意一步或上一步、下一步，右边先给这一步的关键结果；原始 INPUT / OUTPUT 和 Java 代码默认折叠。先“创建实验”，再逐步运行，或“自动跑完剩余步骤”。尚未运行的节点不填造假的输出。重新运行上游会清除下游结果。

A 是政策原文；B 是离线准备，不参与本次提问；C–L 才是实时链路。A 的 5 份原文供 B 建库；B 的政策库供 F 筛选；D 的订单事实和 E 的履约状态供 K 判断。

| 节点 | 这一步做什么 | 应用 / 端口 | 观察重点 |
|---|---|---|---|
| A 政策原文 | 5 份政策文档 → 文档清单 | Spring Boot :8090 · 进程内读取（无模型调用） | 先看每份文档的文档类型、地区、品类、有效期、发布状态和原文，理解知识库里到底有什么 |
| B 离线建政策库 | 5 份政策 → 知识库 | Spring Boot :8090 → 智谱 embedding :443 → Qdrant :6333 | 五种版本解析分块，原文与真实向量前八维、Qdrant point ID 对照 |
| C 从问题里取订单号 | 问题文本 → 订单号 | Spring Boot :8090 · 进程内正则 | 身份由服务端固定，不从问题文本采信 |
| D 查订单（JDBC） | 订单号 → 订单事实 | Spring Boot :8090 → H2 内存库（JDBC） | SQL 是代码里写死的常量，不是模型生成；同时带 customer_id 条件 |
| E 查履约状态（HTTP） | 订单号 → 履约状态 | `Spring Boot :8090 → 本地 mock HTTP 127.0.0.1:<随机端口>` | URL 由应用启动的本地服务生成，不是用户输入 |
| F 筛适用政策 | 订单 + 5 份政策 → 适用范围 | Spring Boot :8090 · 进程内规则 | 对每份政策解释纳入/排除原因；按购买日期选版本，不一定选最新 |
| G 关键词召回 | 范围 + 问题 → 关键词候选 | Spring Boot :8090 · Lucene | 先限定候选文档，实际运行 BM25 Top-K |
| H 向量召回 | 范围 + 问题 → 向量候选 | Spring Boot :8090 → 智谱 embedding :443 → Qdrant :6333 | 相同 Embedding 模型；Qdrant filter 在 Top-K 之前执行 |
| I 融合 | 两路候选 → 融合候选 | Spring Boot :8090 · 进程内 RRF | 同一片段去重，RRF 按名次贡献融合 |
| J 重排 | 融合候选 → 排序结果 | Spring Boot :8090 → 智谱 rerank :443 | 输出真实相关性分数，不是正确率 |
| K 规则判断 + 组装 Prompt | 事实 + 证据 → Prompt | Spring Boot :8090 · 进程内规则 + Prompt 组装 | 确定性判断不由模型完成；事实、状态、政策和引用分开组装 |
| L 生成回答 | Prompt → 回答 + 引用 | Spring Boot :8090 → DeepSeek :443 | 条件性建议与政策引用；无适用证据不调用聊天模型 |

G/H 在实际服务中可以并行。本教程为了观察每个对象，顺序执行。SQL/API 是事实查询；F 是限定范围；G/H 是找相关条款；I/J 是两种不同的排序步骤。BM25、余弦相似度、RRF、重排原始分数不能直接互相比较，也不是正确率。

默认订单 123 应得到：中国区普通商品、签收 3 天、未申请售后；只有 2026 版政策适用，7 天内可有条件申请。商品完好与其他条件未核实，因此不能保证审核通过。

## 每一步的 Java 小实验

源码在 `java-chatbot/src/main/java/chatbot/chat/rag/tutorial/order/`。页面显示构建时直接打包的源文件片段，`demo:start` / `demo:end` 标记对应实际执行方法。查看完整类可以追踪 DTO、注入的依赖及异常处理。

- `OrderData.java`：输入输出 record 契约。
- `DemoOrderRepository.java`：真实 JDBC/H2 查询，不让 LLM 任意拼接 SQL。
- `DemoFulfillmentClient.java`：真实 HTTP 边界；企业落地时替换成经过鉴权的业务 API。
- `OrderPolicies.java`：5 份政策原文（含文档类型）、适用版本筛选和确定性规则；版本选择是业务规则，本例使用购买日期，不是永远选最新。
- `OrderTutorialService.java`：解析、分块、Embedding、双路召回、融合、重排、Prompt、回答及会话隔离。
- `../retrieval/QdrantIndex.java`（相对 rag 包）：Qdrant 的 documentId 过滤请求。

命令行可指定任意终点，自动执行依赖节点，并逐步保存输入输出和 Java 到 `.runtime/order-demo/<runId>/`：

```powershell
# 完整链路
.\scripts\Invoke-OrderTutorial.ps1 -OrderId 123
# 只演示到 SQL / 元数据 / 重排
.\scripts\Invoke-OrderTutorial.ps1 -OrderId 123 -Through sql
.\scripts\Invoke-OrderTutorial.ps1 -OrderId 129 -Through filter
.\scripts\Invoke-OrderTutorial.ps1 -OrderId 123 -Through rerank
```

REST：`POST /api/v1/tutorial/orders/runs` 创建实验（body 为 question）；保留响应的会话 cookie，然后逐步 `POST /runs/{runId}/{node}`。`GET /runs/{runId}` 返回已完成的 traces；`GET /code/{node}` 返回实际源码；`DELETE /runs/{runId}` 清理。CLI 会在 finally 清理自己的教学索引，保存的数据包仍保留。不会删除正式知识库。

## 用反例讲清边界

| 订单 | 演示 |
|---|---|
| 123 | 签收 3 天，条件性可申请，7 天政策 |
| 124 | 签收 10 天，超出本教学政策期限 |
| 125 | 欧洲区，筛出对应的 14 天教学政策 |
| 126 | 数字商品，无适用政策：空召回，不扩大检索范围，不编造答案 |
| 127 | 已申请售后，查看已有进度 |
| 128 | 尚未签收，不能套用签收后的规则 |
| 129 | 旧购买日期，适用 2025 版的 5 天政策；延迟签收为刻意设置的教学数据 |
| 999 | 属于其他用户，SQL 阶段拒绝访问 |

## 距离生产的边界

这是可运行的教学链路，保留现有知识库和 NX 功能。固定用户不是企业身份认证；政策 catalog 不是正式的政策发布系统。生产需接入 SSO、租户/资源授权、受治理的政策版本与生效规则、只读业务账号、超时重试与审计、增量索引/删除同步、答案评估。引用编号校验只检查编号范围，不能证明每句事实正确。页面独立展示业务规则结果以便核对；语言模型仍可能误述，需要进一步做逐句证据校验。

SQL/API 可以只选一种，也可以同时接入，依据企业系统提供数据的方式决定。此教程不执行退货退款写操作。

## 验证记录（2026-10-29）

完整 Maven 测试共 66 项：65 项通过、1 项跳过、0 失败。包含实际 Qdrant 的政策范围过滤及空范围检查。新增 5 项订单测试覆盖 JDBC 归属、HTTP 状态、政策版本、各业务分支、会话隔离与下游失效。

执行 `scripts/Test-OrderTutorial.ps1`，五组真实模型端到端场景（123/124/125/126/129）通过，并验证 999 订单拒绝访问。结果摘要见 [validation.json](validation.json)。每轮完整输入输出保留在本地 `.runtime/order-demo/`，不包含 API Key。

11 节点前端完成 DOM 模拟渲染检查、向量与原文展示检查、重跑失效和清理交互检查；静态资源 HTTP 200。未完成浏览器视觉验收。端到端自动断言验证业务状态、政策范围与引用编号，并不等于逐句事实认证。
