# 极简教程：Harness 如何把 Skill 和 MCP 接起来

## 先看一条完整链路

```text
harness.json             本地配置：Skill 路径、Server 启动方式、预期工具
    ↓
harness.py               MCP Client：启动 Server、建立连接
    ├─ 读取 SKILL.md      给 Agent 的工作步骤
    ├─ tools/list         获取实际工具名称、描述、inputSchema
    └─ tools/call         按参数调用工具
          ↓
server.py                MCP Server：注册 search_knowledge
          ↓
Java /api/v1/search       RAG 检索，返回原文和来源
          ↓
Agent                    结合 Skill 和证据回答（此代码不接生成模型）
```

## 1. Harness 管理配置

查看同目录 `harness.json`。`skills` 保存流程文件路径，`mcpServers` 保存服务器启动信息。
`expectedTools` 记录我们希望服务器提供什么，方便启动时检查；它不会替服务器注册工具。
这些都是本教程自定义字段，不是通用 MCP 配置标准，也不能直接复制到任意客户端设置里。

## 2. Skill 规定怎么用工具

查看 `skills/policy-answer/SKILL.md`：先查政策、再引用证据、缺少订单事实就明确说明。
Skill 是指令文件，Agent 才是执行者。MCP 协议本身不负责加载 Skill。

## 3. Server 声明工具，Client 发现工具

`server.py` 的 `@mcp.tool()` 将函数注册为工具。函数名、docstring 和参数类型形成工具名称、描述及输入 schema。
`harness.py` 调用 `list_tools()`，按分页读取服务器实际工具清单并与配置核对。
服务端工具变化后应重新发现；不能只信配置中的旧清单。

## 4. 调用工具

在仓库根目录执行（先按 README 安装依赖）：

```powershell
# 仅加载 Skill、连接 MCP、显示实际工具，不调用检索服务
.runtime/mcp-example-venv/Scripts/python.exe examples/minimal-mcp-rag/harness.py

# 通过 MCP 真正查询已有 Java 知识库
. ./scripts/Local-Common.ps1
Import-LocalEnvironment
.runtime/mcp-example-venv/Scripts/python.exe examples/minimal-mcp-rag/harness.py "普通商品如何申请退货？"
```

第二条需要 Java 服务、已索引文档及有效的 RAG_API_KEY。令牌由环境传入，不写入配置和工具清单。
脚本直接指定 search_knowledge，演示的是确定性调用；虽然加载并展示 Skill，但没有让 LLM 阅读 Skill 或自主选工具，也没有生成最终答案。
接入 Agent 时，将 Skill 内容和发现的工具 schema 提供给模型；由 Harness 执行模型选定的工具调用，再把结果交回模型。

## 三句话讲完

- Skill：这件事按什么流程做。
- MCP Server：提供哪些可调用能力。
- Harness / MCP Client：管理连接、发现工具、执行调用；也可同时承载 Agent。

可以把 RAG 放在 MCP 工具内部，也可以让外层 Agent 利用 MCP 返回的检索证据完成生成。本例采用后者。
