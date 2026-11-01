"""Protocol smoke check: starts server, lists tool, verifies invalid input is an error."""
import asyncio
import sys
from pathlib import Path
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    params = StdioServerParameters(command=sys.executable,
        args=[str(Path(__file__).with_name("server.py"))])
    async with stdio_client(params) as (reader, writer):
        async with ClientSession(reader, writer) as client:
            await client.initialize()
            result = await client.list_tools()
            assert [tool.name for tool in result.tools] == ["search_knowledge"]
            result = await client.call_tool("search_knowledge", {"query": ""})
            assert result.isError
            print("PASS: MCP initialize, tools/list, tools/call error handling")

if __name__ == "__main__":
    asyncio.run(main())
