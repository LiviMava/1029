package chatbot.chat.rag.tutorial.order;
import chatbot.chat.rag.config.RagProperties;
import chatbot.chat.rag.domain.ChunkRecord;
import chatbot.chat.rag.model.ModelGateway;
import chatbot.chat.rag.retrieval.VectorIndex;
import chatbot.chat.rag.tutorial.classic.ClassicMilvus;
import tools.jackson.databind.ObjectMapper;
import java.util.*;
public class OrderMilvusIndex {
 private final ClassicMilvus client;private final ObjectMapper json;private final String collection;private int dimensions,count;
 public OrderMilvusIndex(ClassicMilvus client,ObjectMapper json,String collection){this.client=client;this.json=json;this.collection=collection;}
 public void addWithEmbeddings(List<ChunkRecord> chunks,List<float[]> vectors){
  if(chunks.isEmpty()||chunks.size()!=vectors.size())throw new IllegalArgumentException("片段与向量数量不匹配");
  dimensions=vectors.get(0).length;List<Map<String,Object>> rows=new ArrayList<>();
  for(int i=0;i<chunks.size();i++){var c=chunks.get(i);if(vectors.get(i).length!=dimensions)throw new IllegalArgumentException("向量维度不一致");rows.add(Map.of("id",i+1,"chunkId",c.id(),"documentId",c.documentId(),"text",c.text(),"vector",vectors.get(i)));}
  client.store(collection,dimensions,rows);count=chunks.size();
 }
 public List<VectorIndex.Match> searchWithVectorInDocuments(float[] vector,int limit,double threshold,Collection<String> ids){
  if(ids.isEmpty())return List.of();
  var data=client.call("entities/search",Map.of("collectionName",collection,"data",List.of(vector),"annsField","vector","limit",limit,"filter",filter(ids),"outputFields",List.of("chunkId","documentId"),"consistencyLevel","Strong"));
  List<VectorIndex.Match> hits=new ArrayList<>();
  for(var row:data){if(!ids.contains(row.path("documentId").asText()))throw new IllegalStateException("Milvus 返回范围外片段");double score=row.path("distance").asDouble();if(score>=threshold)hits.add(new VectorIndex.Match(row.path("chunkId").asText(),score));}
  return hits;
 }
 public String filter(Collection<String> ids){return "documentId in "+json.writeValueAsString(ids);}
 public Map<String,Object> statistics(){return Map.of("collection",collection,"pointsCount",count,"dimensions",dimensions,"distance","COSINE","engine","Milvus","countSource","本轮成功写入数量");}
 public void deleteTutorialCollection(){if(!collection.startsWith("rag_tutorial_orders_"))throw new IllegalStateException("非教学集合");client.drop(collection);}
}
