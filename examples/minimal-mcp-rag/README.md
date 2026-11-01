# 极简：Skill + MCP + RAG

```text
用户问题 → Agent 读取 Skill 的步骤
                 ↓ MCP tools/call: search_knowledge(query)
            Python MCP 服务
                 ↓ HTTP POST /api/v1/search
            现有 Java 检索服务 → 原文 + 来源
                 ↓
            Agent 根据证据生成回答
```

Skill 是工作流程说明；真正调用工具的是宿主中的 Agent。
MCP 是暴露和调用工具的协议；工具实现可以调用检索服务、业务接口，也可以封装完整 RAG。
本例工具只做检索，生成在外层 Agent 完成。也可以将检索和生成一起封装为 ask_knowledge 工具。
RAG 应用也能作为 MCP 客户端获取外部证据。能组合，但应明确谁检索、谁生成，避免重复生成和循环调用。

## 运行

在仓库根目录执行：

```powershell
python -m venv .runtime/mcp-example-venv
.runtime/mcp-example-venv/Scripts/python.exe -m pip install -r examples/minimal-mcp-rag/requirements.txt
. ./scripts/Local-Common.ps1
Import-LocalEnvironment
.runtime/mcp-example-venv/Scripts/python.exe examples/minimal-mcp-rag/server.py
```

最后一条命令等待 MCP 客户端通过 stdin/stdout 通信；不是网页，没有 HTTP 网址。
示例明确使用 Python SDK 1.x 的 FastMCP API（约束 <2）；2.x 更名为 MCPServer，请勿直接混用 API。
Java 服务需先启动；在 http://127.0.0.1:8090 上传知识文档并等待索引完成。
正式知识库与 01/02 教学临时集合独立；教学订单不会自动出现在本工具中。
如果要演示退货政策，先上传 java-chatbot/src/main/resources/tutorial/classic/return-policy.md。
本工具没有实时订单查询，因此不能仅凭检索结果保证订单 123 的当前退货资格。

## MCP 客户端配置

在支持 stdio 的客户端添加服务器：

```json
{
  "mcpServers": {
    "local-rag": {
      "command": "D:/AIDemo/codex-demos/924-main/.runtime/mcp-example-venv/Scripts/python.exe",
      "args": ["D:/AIDemo/codex-demos/924-main/examples/minimal-mcp-rag/server.py"],
      "env": {"RAG_API_KEY": "填写本机服务令牌"}
    }
  }
}
```

这是常见客户端 JSON 格式；具体宿主配置格式可能不同。令牌从本机配置取值，不要把真实值提交到 Git。
客户端连接后应发现 search_knowledge，调用参数示例：`{"query":"普通商品如何申请退货？"}`。
连接失败、超时、鉴权失败作为工具错误返回，不能当成“没有证据”。

## Skill 中可以怎样写（指令片段）

> 用户询问企业政策时，调用已连接的 search_knowledge 工具查找依据。
> 根据返回的原文和来源回答，区分政策条件和已核实的订单事实。
> 没有命中时说明证据不足；工具报错时说明查询失败。
> 对每项结论给出来源，不保证退款成功。

宿主需要先连接 MCP 并提供该工具；仅写 Skill 不会自动获得连接或权限。

官方资料：
- https://developers.openai.com/plugins/concepts/skills
- https://github.com/modelcontextprotocol/python-sdk/blob/main/docs/migration.md

## 验证

```powershell
.runtime/mcp-example-venv/Scripts/python.exe examples/minimal-mcp-rag/check.py
```

已验证 SDK 1.30.0 的真实 stdio 握手、工具发现与非法输入错误返回。
该检查不调用云模型，也不证明正式知识库已有可检索内容。
