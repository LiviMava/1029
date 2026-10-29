package chatbot.chat.rag.tutorial.order;

import java.time.LocalDate;
import java.util.List;

/** Typed objects passed between the teaching nodes. All business data is fictional. */
public final class OrderData {
    private OrderData() {}
    public static final LocalDate DEMO_DATE = LocalDate.of(2026, 10, 28);
    public static final String DEMO_CUSTOMER = "demo-alice";
    public record Intent(long orderId, String customerId, String question, LocalDate asOf) {}
    public record Order(long id, String customerId, String category, String region, String model, LocalDate purchasedAt) {}
    public record Fulfillment(long orderId, String status, LocalDate signedAt, boolean afterSaleOpen, LocalDate observedAt, String source) {}
    public record Policy(String id, String title, String documentType, String region, String category, LocalDate effectiveFrom,
                         LocalDate effectiveTo, boolean published, int returnDays, String text) {}
    public record FilterRow(String policyId, String title, boolean included, List<String> reasons) {}
    public record Scope(List<String> allowedDocumentIds, List<FilterRow> evaluations, LocalDate policyDate) {}
    public record Eligibility(String status, long signedDays, int returnDays, String reason, String action) {}
}
