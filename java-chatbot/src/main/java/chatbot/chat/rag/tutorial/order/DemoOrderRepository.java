package chatbot.chat.rag.tutorial.order;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import static chatbot.chat.rag.tutorial.order.OrderData.*;

/** Isolated in-memory database: no production order access, no model-generated SQL. */
@Component
@ConditionalOnProperty(name="rag.tutorial.enabled", havingValue="true")
public class DemoOrderRepository {
    private final JdbcTemplate jdbc;
    public static final String SQL = "SELECT id, customer_id, category, region, model, purchased_at FROM demo_orders WHERE id = ? AND customer_id = ?";
    public DemoOrderRepository() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:order_demo_" + java.util.UUID.randomUUID() + ";DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("CREATE TABLE demo_orders(id BIGINT PRIMARY KEY, customer_id VARCHAR(40), category VARCHAR(40), region VARCHAR(20), model VARCHAR(40), purchased_at DATE)");
        for (long id : new long[]{123,124,125,126,127,128,129,999}) {
            jdbc.update("INSERT INTO demo_orders VALUES(?,?,?,?,?,?)", id, id==999?"demo-bob":DEMO_CUSTOMER,
                id==126?"DIGITAL":"STANDARD", id==125?"EU":"CN", "MODEL-A",
                java.sql.Date.valueOf(id==129?"2025-12-25":"2026-10-15"));
        }
    }
    // demo:start sql
    public Order findOwned(Intent request) {
        // Identity is supplied by the server's demo principal, not by the browser.
        var orders = jdbc.query(SQL, (rs, row) -> new Order(rs.getLong("id"), rs.getString("customer_id"),
            rs.getString("category"), rs.getString("region"), rs.getString("model"), rs.getDate("purchased_at").toLocalDate()),
            request.orderId(), request.customerId());
        if (orders.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "订单不存在或不属于当前演示用户");
        return orders.get(0);
    }
    // demo:end sql
    @jakarta.annotation.PreDestroy public void close() {jdbc.execute("SHUTDOWN");}
}
