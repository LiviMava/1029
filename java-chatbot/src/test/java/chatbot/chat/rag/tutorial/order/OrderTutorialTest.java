package chatbot.chat.rag.tutorial.order;

import chatbot.chat.rag.config.RagProperties;
import chatbot.chat.rag.domain.SearchHit;
import chatbot.chat.rag.ingest.DocumentParser;
import chatbot.chat.rag.model.ModelGateway;
import chatbot.chat.rag.retrieval.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.util.*;
import static chatbot.chat.rag.tutorial.order.OrderData.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class OrderTutorialTest {
    @TempDir Path data;
    DemoOrderRepository orders;
    DemoFulfillmentClient api;
    OrderTutorialService service;
    ModelGateway models;
    Reranker reranker;
    QdrantIndex index;
    @BeforeEach void setUp() throws Exception {
        orders=new DemoOrderRepository();api=new DemoFulfillmentClient(new ObjectMapper());
        models=mock(ModelGateway.class);reranker=mock(Reranker.class);index=mock(QdrantIndex.class);
        when(models.embeddingConfigured()).thenReturn(true);when(models.chatConfigured()).thenReturn(true);
        when(models.embed(anyList())).thenAnswer(call->((List<?>)call.getArgument(0)).stream().map(x->new float[]{1,0,0,0}).toList());
        when(models.tutorialAnswer(any())).thenReturn("签收 3 天，在 7 天期限内；商品完好等条件需确认。[1]");
        when(reranker.configured()).thenReturn(true);when(reranker.scoreType()).thenReturn("RAW_RELEVANCE");when(reranker.model()).thenReturn("test");
        when(reranker.rerank(anyString(),anyList(),anyInt())).thenAnswer(call->call.getArgument(1));
        when(index.statistics()).thenReturn(Map.of("pointsCount",10,"dimensions",4,"collection","rag_tutorial_test"));
        var p=new RagProperties(data,"",new RagProperties.Model("","",""),new RagProperties.Embedding("","","test",4),
            new RagProperties.Qdrant("localhost",6334,"http://localhost:6333","",false,"test"),new RagProperties.Retrieval(10,4,-1,"","",""));
        service=spy(new OrderTutorialService(p,models,new DocumentParser(),reranker,new ObjectMapper(),orders,api));
        doReturn(index).when(service).createIndex(any());
    }
    @AfterEach void close(){api.close();orders.close();}
    String create(long id){return (String)((Map<?,?>)service.create("owner","我的订单 "+id+" 现在能退货吗？如果可以该怎么操作？")).get("runId");}
    void through(String id,String last){for(var n:OrderTutorialService.NODES){service.execute("owner",id,n.id());if(n.id().equals(last))break;}}
    @Test void jdbcBindsOwnerAndDoesNotAcceptOtherCustomers() {
        assertEquals(123,orders.findOwned(OrderTutorialService.question("订单 123 能退吗")).id());
        assertThrows(ResponseStatusException.class,()->orders.findOwned(OrderTutorialService.question("订单 999 能退吗")));
        assertThrows(ResponseStatusException.class,()->orders.findOwned(new Intent(123,"' OR 1=1 --","question",DEMO_DATE)));
        assertThrows(IllegalArgumentException.class,()->OrderTutorialService.question("订单123和订单124"));
    }
    @Test void httpStatusAndPolicyDateAreRealSeparateBoundaries() {
        Order order=orders.findOwned(OrderTutorialService.question("订单123"));
        Fulfillment status=api.fetch(order);assertEquals(DEMO_DATE.minusDays(3),status.signedAt());
        Scope scope=OrderPolicies.scope(order,OrderPolicies.all());assertEquals(List.of("cn-standard-2026"),scope.allowedDocumentIds());
        assertEquals(4,scope.evaluations().stream().filter(x->!x.included()).count());
        assertEquals("CONDITIONAL",OrderPolicies.evaluate(order,status,scope,true).status());
        Order old=orders.findOwned(OrderTutorialService.question("订单129"));
        assertEquals(List.of("cn-standard-2025"),OrderPolicies.scope(old,OrderPolicies.all()).allowedDocumentIds());
    }
    @Test void businessBranchesDoNotPromiseEligibility() {
        Map<Long,String> cases=Map.of(124L,"OUTSIDE_WINDOW",126L,"INSUFFICIENT_EVIDENCE",127L,"ALREADY_REQUESTED",128L,"NOT_DELIVERED");
        cases.forEach((id,status)->{Order o=orders.findOwned(OrderTutorialService.question("订单"+id));assertEquals(status,OrderPolicies.evaluate(o,api.fetch(o),OrderPolicies.scope(o,OrderPolicies.all()),true).status());});
        Order eu=orders.findOwned(OrderTutorialService.question("订单125"));assertEquals(14,OrderPolicies.evaluate(eu,api.fetch(eu),OrderPolicies.scope(eu,OrderPolicies.all()),true).returnDays());
    }
    @Test void pipelineFiltersBothBranchesBeforeFusionAndShowsActualJava() {
        String id=create(123);through(id,"keyword");
        var state=(Map<?,?>)service.state("owner",id);var stages=(Map<?,?>)state.get("stages");
        var recall=(OrderTutorialService.Recall)((OrderTutorialService.Trace)stages.get("keyword")).output();
        assertFalse(recall.hits().isEmpty());assertTrue(recall.hits().stream().allMatch(h->h.documentId().equals("cn-standard-2026")));
        when(index.searchWithVectorInDocuments(any(),anyInt(),anyDouble(),any())).thenReturn(recall.hits().stream().map(h->new VectorIndex.Match(h.id(),.8)).toList());
        service.execute("owner",id,"vector");verify(index).searchWithVectorInDocuments(any(),eq(6),eq(-1.0),eq(List.of("cn-standard-2026")));
        for(String stage:List.of("fusion","rerank","prompt","answer"))service.execute("owner",id,stage);
        assertTrue(service.code("sql").text().contains("jdbc.query(SQL"));
        assertTrue(service.code("vector").text().contains("searchWithVectorInDocuments"));
        service.execute("owner",id,"sql");
        var after=(Map<?,?>)((Map<?,?>)service.state("owner",id)).get("stages");assertFalse(after.containsKey("answer"));
        assertThrows(ResponseStatusException.class,()->service.execute("owner",id,"answer"));
        service.delete("owner",id);verify(index).deleteTutorialCollection();
    }
    @Test void emptyScopeNeverQueriesAllVectorsAndRefusesWithoutChat() {
        String id=create(126);through(id,"answer");
        verify(index,never()).searchWithVectorInDocuments(any(),anyInt(),anyDouble(),any());
        verify(models,never()).tutorialAnswer(any());verify(reranker,never()).rerank(anyString(),anyList(),anyInt());
        var stages=(Map<?,?>)((Map<?,?>)service.state("owner",id)).get("stages");
        var answer=(OrderTutorialService.Answer)((OrderTutorialService.Trace)stages.get("answer")).output();
        assertEquals("INSUFFICIENT_EVIDENCE",answer.eligibility().status());assertTrue(answer.citations().isEmpty());
        assertThrows(ResponseStatusException.class,()->service.state("other",id));service.delete("owner",id);
    }
}
