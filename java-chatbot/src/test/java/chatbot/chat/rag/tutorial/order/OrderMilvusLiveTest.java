package chatbot.chat.rag.tutorial.order;
import chatbot.chat.rag.domain.ChunkRecord;
import chatbot.chat.rag.tutorial.classic.ClassicMilvus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.ObjectMapper;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
class OrderMilvusLiveTest {
 @Test @EnabledIfEnvironmentVariable(named="RAG_TEST_MILVUS_URL",matches=".+")
 void filtersBeforeTopKAndCleansOnlyOwnedCollection(){
  var json=new ObjectMapper();var client=new ClassicMilvus(json,System.getenv("RAG_TEST_MILVUS_URL"),"");
  var index=new OrderMilvusIndex(client,json,"rag_tutorial_orders_test_"+UUID.randomUUID().toString().replace("-",""));
  try{
   index.addWithEmbeddings(List.of(new ChunkRecord("allowed-chunk","allowed",0,"allowed",null,"title"),new ChunkRecord("excluded-chunk","excluded",0,"excluded",null,"title")),List.of(new float[]{.8f,.2f,0,0},new float[]{1,0,0,0}));
   var hits=index.searchWithVectorInDocuments(new float[]{1,0,0,0},1,-1,List.of("allowed"));
   assertEquals(1,hits.size());assertEquals("allowed-chunk",hits.get(0).id());
   assertTrue(index.searchWithVectorInDocuments(new float[]{1,0,0,0},1,-1,List.of()).isEmpty());
   assertTrue(index.searchWithVectorInDocuments(new float[]{1,0,0,0},1,-1,List.of("absent")).isEmpty());
  }finally{index.deleteTutorialCollection();index.deleteTutorialCollection();}
 }
}
