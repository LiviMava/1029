package chatbot.chat.rag.tutorial.order;

import com.sun.net.httpserver.HttpServer;
import jakarta.annotation.PreDestroy;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.Set;
import static chatbot.chat.rag.tutorial.order.OrderData.*;

/** Real HTTP boundary against a loopback-only fictional fulfillment provider. */
@Component
@ConditionalOnProperty(name="rag.tutorial.enabled", havingValue="true")
public class DemoFulfillmentClient {
    private final ObjectMapper json;
    private final HttpServer server;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    public DemoFulfillmentClient(ObjectMapper json) throws java.io.IOException {
        this.json=json;
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/status/",exchange->{
            try {
                String path=exchange.getRequestURI().getPath();
                if(!exchange.getRequestMethod().equals("GET") || !path.matches("/status/[0-9]{1,6}")) {exchange.sendResponseHeaders(404,-1);return;}
                long id=Long.parseLong(path.substring("/status/".length()));
                if(!Set.of(123L,124L,125L,126L,127L,128L,129L).contains(id)) {exchange.sendResponseHeaders(404,-1);return;}
                var state=new Fulfillment(id,id==128?"IN_TRANSIT":"DELIVERED",id==128?null:DEMO_DATE.minusDays(id==124?10:3),
                    id==127,DEMO_DATE,"LOCAL_FIXTURE_HTTP · 虚构履约状态");
                byte[] bytes=json.writeValueAsBytes(state);
                exchange.getResponseHeaders().set("Content-Type","application/json; charset=utf-8");
                exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);
            } finally {exchange.close();}
        });
        server.start();
    }
    public String endpoint(long orderId) {return "http://127.0.0.1:"+server.getAddress().getPort()+"/status/"+orderId;}
    // demo:start api
    public Fulfillment fetch(Order order) {
        // Only an ownership-checked Order can reach this stage. The endpoint is server-controlled.
        var request=HttpRequest.newBuilder(URI.create(endpoint(order.id())))
            .timeout(Duration.ofSeconds(5)).GET().build();
        try {
            var response=http.send(request,HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()!=200) throw new IllegalStateException("履约状态不可用，不得猜测物流或售后状态");
            Fulfillment status=json.readValue(response.body(),Fulfillment.class);
            if(status.orderId()!=order.id()) throw new IllegalStateException("履约状态与订单不匹配");
            return status;
        } catch(InterruptedException e) {
            Thread.currentThread().interrupt();throw new IllegalStateException("业务查询已中断",e);
        } catch(java.io.IOException e) {throw new IllegalStateException("业务 API 请求失败",e);}
    }
    // demo:end api
    @PreDestroy public void close() {server.stop(0);}
}
