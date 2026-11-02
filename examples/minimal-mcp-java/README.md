# Java 极简 MCP

Java 17 + Spring Boot + Spring AI MCP Server。一个类同时提供 Server 和显式客户端演示。

在仓库根目录构建：`mvn -f examples/minimal-mcp-java/pom.xml package`。
然后进入 `examples/minimal-mcp-java`：

```powershell
# 终端一：先设置环境变量 RAG_API_KEY，再启动服务
java -jar target/minimal-mcp-java-1.0.0.jar
# 终端二：加载 Skill 并发现工具
java -jar target/minimal-mcp-java-1.0.0.jar --client
# 真正调用检索（要求 8090 服务和已索引文档）
java -jar target/minimal-mcp-java-1.0.0.jar --client "普通商品如何申请退货？"
```

MCP 地址 http://127.0.0.1:8766/mcp，使用 Streamable HTTP，仅绑定本机。
harness.properties 为教学自定义配置，复用上一例的 Skill。Skill 被读取打印；没有 LLM 自主规划，客户端显式选定工具。
工具调用现有 Java RAG /api/v1/search；不读取教学临时集合、不查询实时订单。
密钥只从环境读取。本地教学服务未实现远程访问鉴权，不应直接改为公网监听。
