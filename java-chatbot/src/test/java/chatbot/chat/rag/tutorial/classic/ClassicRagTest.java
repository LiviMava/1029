package chatbot.chat.rag.tutorial.classic;
import chatbot.chat.rag.domain.SearchHit;
import chatbot.chat.rag.ingest.DocumentParser;
import chatbot.chat.rag.model.ModelGateway;
import chatbot.chat.rag.retrieval.Reranker;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class ClassicRagTest {
    @Test void actualDocumentsParseAndChunkWithProvenance(){
        var s=new ClassicRagService(new DocumentParser(),mock(ModelGateway.class),mock(ClassicMilvus.class),mock(Reranker.class),new ObjectMapper());
        var docs=s.documents();assertEquals(3,docs.size());assertEquals(3,s.parse(docs).size());
        var pieces=s.chunk(s.parse(docs));assertTrue(pieces.stream().allMatch(p->p.text().length()<=220));
        assertTrue(pieces.stream().anyMatch(p->p.source().equals("order-123.md")&&p.text().contains("123")));
        assertTrue(pieces.stream().anyMatch(p->p.text().contains("7 天")));
        assertTrue(pieces.stream().anyMatch(p->p.text().contains("退货退款")));
    }
    @Test void pipelineUsesOnlyVectorRecallAndKeepsOwnerIsolation(){
        var model=mock(ModelGateway.class);var milvus=mock(ClassicMilvus.class);var reranker=mock(Reranker.class);var json=new ObjectMapper();
        when(model.embed(anyList())).thenAnswer(c->((List<?>)c.getArgument(0)).stream().map(v->new float[]{1,0,0}).toList());
        when(model.tutorialAnswer(any())).thenReturn("根据快照，可以有条件申请。[1]");
        when(milvus.store(anyString(),eq(3),anyList())).thenReturn(Map.of("insertCount",5));
        when(milvus.search(anyString(),any())).thenReturn(json.readTree("[{\"id\":1,\"source\":\"return-policy.md\",\"text\":\"7 天内可申请退货\",\"distance\":0.9}]"));
        when(reranker.configured()).thenReturn(true);when(reranker.rerank(anyString(),anyList(),eq(6))).thenAnswer(c->c.getArgument(1));
        var s=new ClassicRagService(new DocumentParser(),model,milvus,reranker,json);
        String id=(String)((Map<?,?>)s.create("alice","订单 123 能退吗")).get("runId");
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->s.state("bob",id));
        assertThrows(IllegalStateException.class,()->s.execute("alice",id,"search"));
        for(String step:ClassicRagService.STEPS)assertNotNull(s.execute("alice",id,step).output());
        verify(milvus,times(1)).search(anyString(),any());verify(reranker).rerank(eq("订单 123 能退吗"),anyList(),eq(6));
        s.delete("alice",id);verify(milvus).drop(startsWith("classic_demo_"));
    }
    @Test void milvusRestUsesV2Contract() throws Exception {
        var json=new ObjectMapper();var requests=new ArrayList<String>();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/v2/vectordb/",e->{String body=new String(e.getRequestBody().readAllBytes(),StandardCharsets.UTF_8);requests.add(e.getRequestURI()+" "+body);byte[] out="{\"code\":0,\"data\":[]}".getBytes(StandardCharsets.UTF_8);e.sendResponseHeaders(200,out.length);e.getResponseBody().write(out);e.close();});server.start();
        try{var m=new ClassicMilvus(json,"http://127.0.0.1:"+server.getAddress().getPort(),"");
            m.store("classic_demo_test",3,List.of(Map.of("id",1,"vector",new float[]{1,0,0},"source","a.md","text","原文")));
            m.search("classic_demo_test",new float[]{1,0,0});
            assertTrue(requests.get(0).contains("COSINE"));assertTrue(requests.get(1).contains("entities/insert"));
            assertTrue(requests.get(2).contains("\"consistencyLevel\":\"Strong\""));
        }finally{server.stop(0);}
    }
}
