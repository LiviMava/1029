package chatbot.chat.rag.tutorial.classic;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;

/** Real Milvus REST v2 adapter. Never falls back to another store or fake vectors. */
@Component
public class ClassicMilvus {
    private final ObjectMapper json;
    private final String url, token;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    public ClassicMilvus(ObjectMapper json,
        @Value("${RAG_MILVUS_URL:http://127.0.0.1:19530}") String url,
        @Value("${RAG_MILVUS_TOKEN:}") String token) {
        this.json=json;this.url=url.replaceAll("/+$","");this.token=token;
    }
    public JsonNode call(String operation,Object body) {
        try {
            var request=HttpRequest.newBuilder(URI.create(url+"/v2/vectordb/"+operation))
                .timeout(Duration.ofSeconds(30)).header("Content-Type","application/json");
            if(!token.isBlank())request.header("Authorization","Bearer "+token);
            var response=http.send(request.POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());
            var data=json.readTree(response.body());
            if(response.statusCode()/100!=2 || !data.has("code") || data.path("code").asInt()!=0)
                throw new IllegalStateException("Milvus 请求失败："+operation+"（HTTP "+response.statusCode()+"，code "+data.path("code").asText()+"）");
            return data.path("data");
        } catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException("Milvus 请求中断",e);}
        catch(java.io.IOException e){throw new IllegalStateException("Milvus 未连接；请启动 Milvus 或配置 RAG_MILVUS_URL",e);}
    }
    public boolean available(){try{call("collections/list",Map.of());return true;}catch(RuntimeException e){return false;}}
    // demo:start store
    public Object store(String collection,int dimensions,List<Map<String,Object>> rows) {
        // Quick setup creates a vector index and loads the collection. Dynamic fields retain source text.
        call("collections/create",Map.of("collectionName",collection,"dimension",dimensions,
            "metricType","COSINE","idType","Int64","autoID",false));
        return call("entities/insert",Map.of("collectionName",collection,"data",rows));
    }
    // demo:end store
    // demo:start search
    public JsonNode search(String collection,float[] questionVector) {
        // Single vector recall only. No SQL, business API, BM25 or RRF.
        return call("entities/search",Map.of("collectionName",collection,"data",List.of(questionVector),
            "annsField","vector","limit",6,"outputFields",List.of("text","source"),"consistencyLevel","Strong"));
    }
    // demo:end search
    public void drop(String collection){
        var body=Map.of("collectionName",collection);
        if(call("collections/has",body).path("has").asBoolean())call("collections/drop",body);
    }
}
