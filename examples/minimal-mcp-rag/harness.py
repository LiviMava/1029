"""Minimal deterministic harness: config -> skill -> tools/list -> optional tools/call."""
import asyncio
import json
import os
from pathlib import Path
import sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = Path(__file__).resolve().parent

async def main():
    config = json.loads((ROOT / "harness.json").read_text(encoding="utf-8"))
    skill = (ROOT / config["skills"]["policy-answer"]).read_text(encoding="utf-8")
    server = config["mcpServers"]["local-rag"]
    params = StdioServerParameters(
        command=sys.executable, args=[str(ROOT / server["script"])],
        env={key: os.environ[key] for key in server["envFrom"] if key in os.environ},
    )
    async with stdio_client(params) as (reader, writer):
        async with ClientSession(reader, writer) as client:
            await client.initialize()
            tools = []
            cursor = None
            while True:
                page = await client.list_tools(cursor=cursor)
                tools.extend(page.tools)
                cursor = page.nextCursor
                if not cursor:
                    break
            catalog = {tool.name: tool.model_dump(mode="json") for tool in tools}
            missing = set(server["expectedTools"]) - catalog.keys()
            if missing:
                raise RuntimeError(f"Server is missing expected tools: {sorted(missing)}")
            print(json.dumps({"skill": skill, "discoveredTools": catalog}, ensure_ascii=False, indent=2))
            # An Agent would receive the skill and tools here. This demo selects one tool explicitly.
            if len(sys.argv) > 1:
                result = await client.call_tool("search_knowledge", {"query": sys.argv[1]})
                print(result.model_dump_json(indent=2))
                if result.isError:
                    raise SystemExit(1)

if __name__ == "__main__":
    asyncio.run(main())
