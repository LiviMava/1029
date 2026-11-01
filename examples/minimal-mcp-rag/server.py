import json
import os
from urllib.request import Request, urlopen
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("local-rag")


@mcp.tool()
def search_knowledge(query: str) -> dict:
    """Search the knowledge base; return evidence and sources, not a final answer."""
    if not query.strip() or len(query) > 2000:
        raise ValueError("query must contain 1–2000 characters")
    request = Request(
        "http://127.0.0.1:8090/api/v1/search",
        data=json.dumps({"query": query, "topK": 3}).encode(),
        headers={"Content-Type": "application/json",
                 "Authorization": "Bearer " + os.environ.get("RAG_API_KEY", "")},
        method="POST",
    )
    with urlopen(request, timeout=60) as response:
        return json.load(response)


if __name__ == "__main__":
    mcp.run(transport="stdio")
