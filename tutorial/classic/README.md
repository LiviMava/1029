# 第一讲：订单 123，经典 RAG

入口：http://127.0.0.1:8090/classic-tutorial.html
第二讲：http://127.0.0.1:8090/tutorial.html

## 演讲顺序

1. 问：我的订单 123 现在能退货吗？如果可以，该怎么操作？模型没有企业资料，无法可靠回答。
2. 文档：订单快照 + 退货政策 + 配送 FAQ。展开原文，看“签收 3 天”“7 天期限”和操作路径。所有资料虚构，日期固定为 2026-10-28。
3. 建库：解析 → 分块（220 字符 / 40 重叠）→ Spring AI Embedding → Milvus。观察每块原文、向量前 8 维与存储行的对应关系。
4. 问答：同一个模型向量化问题 → Milvus 单路 Top 6 → 重排 → 组装 system/user → Spring AI 生成。
5. 最后核对：回答是否同时说明有条件申请、商品完好待确认、操作步骤，并能在原文找到依据？引用本身不保证正确。
6. 点击第二讲：如果订单状态发生变化、政策有多个版本、相似片段不适用怎么办？再引入 SQL/业务 API、适用性过滤、BM25+向量及规则判断。

页面不预填运行结果。输入输出和代码均可逐步查看；“展开 Spring AI 模型调用实现”来自本次构建的 ModelGateway.java。解析与分块为项目自有 Java 实现，Milvus 使用真实 REST v2；Embedding 与生成使用 Spring AI，重排复用已配置 Reranker。没有 SQL 查询、订单 HTTP 查询、多路召回或业务规则资格计算。这里的 Milvus REST/模型 HTTP 是技术连接，不是业务数据查询。

## 本地 Milvus

本机已安装独立 WSL 实例 `codex-milvus`（Ubuntu 24.04），Docker 容器 `codex-milvus` 使用官方 `milvusdb/milvus:v2.6.4`，镜像摘要 `sha256:27f1732a6668c813ee96d21364e3ba220ce1dd1d6e07660106d646dc33d1c654`。

```powershell
.\scripts\Start-Milvus.ps1
.\scripts\Start-Local.ps1 -SkipBuild
# 停止数据库，保留数据
.\scripts\Stop-Milvus.ps1
```

Milvus REST/gRPC：http://127.0.0.1:19530；健康检查：http://127.0.0.1:9091/healthz。
WSL 虚拟磁盘位于 `.runtime/ubuntu-milvus`；数据库数据在该 Linux 的 `/opt/codex-milvus/data`。不要在实例运行中移动或删除磁盘。
每轮实验有独立 `classic_demo_<UUID>` collection，清理按钮删除本轮集合，30 分钟过期后定期清理。正式 Qdrant 知识库独立保留。

可在 `.local.env` 设置 `RAG_MILVUS_URL`（默认本地 19530）和 `RAG_MILVUS_TOKEN`（本地实例未启用认证，保持为空），修改后重启应用。页面需要与知识库相同的服务访问令牌；新标签页可展开“服务访问令牌”填写本地 RAG_API_KEY，不是模型供应商密钥。

## 验证

专项自动测试：真实 Markdown 解析与分块、完整链路测试桩、会话归属与顺序约束、Milvus REST v2 请求格式。完整测试 69 项，67 通过、2 跳过。另使用真实本地 Milvus 临时集合验证 create/insert/search/drop，结果成功；测试向量仅用于协议验收，不进入教学页面。

官方协议参考：https://milvus.io/api-reference/restful/v2.6.x/v2/Collection%20(v2)/Create.md
官方独立部署参考：https://github.com/milvus-io/milvus/blob/v2.6.4/scripts/standalone_embed.sh
