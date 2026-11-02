package demo;

import io.modelcontextprotocol.client.McpClient;
import io.modelcontextprotocol.client.transport.HttpClientStreamableHttpTransport;
import io.modelcontextprotocol.server.McpServerFeatures.SyncToolSpecification;
import io.modelcontextprotocol.spec.McpSchema;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import tools.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;

@SpringBootApplication
public class Application {
    public static void main(String[] args) throws Exception {
        if(args.length>0 && args[0].equals("--client")) { client(args); return; }
        SpringApplication.run(Application.class,args);
    }

    @Bean List<SyncToolSpecification> tools(ObjectMapper json) {
        var tool=McpSchema.Tool.builder().name("search_knowledge")
            .description("Search policy evidence and sources; does not query live orders.")
            .inputSchema(Map.of("type","object","properties",Map.of("query",Map.of("type","string")),
                "required",List.of("query"),"additionalProperties",false)).build();
        var http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        return List.of(new SyncToolSpecification(tool,(exchange,request)->{
            Object query=request.arguments()==null?null:request.arguments().get("query");
            if(!(query instanceof String text) || text.isBlank() || text.length()>2000)
                return McpSchema.CallToolResult.builder().isError(true).addTextContent("query must contain 1–2000 characters").build();
            try {
                var call=HttpRequest.newBuilder(URI.create("http://127.0.0.1:8090/api/v1/search"))
                    .timeout(Duration.ofSeconds(60)).header("Content-Type","application/json")
                    .header("Authorization","Bearer "+System.getenv().getOrDefault("RAG_API_KEY",""))
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(Map.of("query",text,"topK",3)))).build();
                var response=http.send(call,HttpResponse.BodyHandlers.ofString());
                if(response.statusCode()!=200) throw new IllegalStateException("RAG HTTP "+response.statusCode());
                return McpSchema.CallToolResult.builder().addTextContent(response.body()).build();
            } catch(Exception e) {
                if(e instanceof InterruptedException) Thread.currentThread().interrupt();
                return McpSchema.CallToolResult.builder().isError(true).addTextContent("RAG query failed; check local service and token.").build();
            }
        }));
    }

    static void client(String[] args) throws Exception {
        var config=new Properties();
        try(var reader=Files.newBufferedReader(Path.of("harness.properties"))) { config.load(reader); }
        System.out.println(Files.readString(Path.of(config.getProperty("skill.path"))));
        var transport=HttpClientStreamableHttpTransport.builder(config.getProperty("server.url"))
            .endpoint("/mcp").openConnectionOnStartup(false).build();
        try(var client=McpClient.sync(transport).requestTimeout(Duration.ofSeconds(75)).build()) {
            client.initialize();
            var names=new HashSet<String>();String cursor=null;
            do { var page=client.listTools(cursor);page.tools().forEach(t->{names.add(t.name());System.out.println(t);});cursor=page.nextCursor(); } while(cursor!=null);
            String name=config.getProperty("expected.tool");
            if(!names.contains(name)) throw new IllegalStateException("Missing tool: "+name);
            if(args.length>1) {
                var result=client.callTool(McpSchema.CallToolRequest.builder(name).arguments(Map.of("query",args[1])).build());
                System.out.println(result);
                if(Boolean.TRUE.equals(result.isError())) throw new IllegalStateException("Tool returned an error");
            }
        }
    }
}
