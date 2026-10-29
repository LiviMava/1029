package chatbot.chat.rag.tutorial.order;

import java.time.LocalDate;
import java.util.*;
import static chatbot.chat.rag.tutorial.order.OrderData.*;

public final class OrderPolicies {
    private OrderPolicies() {}
    // demo:start documents
    public static List<Policy> all() {
        // 5 份虚构政策：同一品类在不同地区/年份的版本，外加一份未发布草稿。
        // documentType 标明“退货政策 / 退货政策草稿”；后续筛选用地区、品类、购买日期和发布状态选出一份适用版本。
        return List.of(
            policy("cn-standard-2025","中国区普通商品退货政策 2025","CN","STANDARD","2025-01-01","2026-01-01",true,5),
            policy("cn-standard-2026","中国区普通商品退货政策 2026","CN","STANDARD","2026-01-01","2027-01-01",true,7),
            policy("cn-standard-2027","中国区普通商品退货政策 2027","CN","STANDARD","2027-01-01","2028-01-01",true,14),
            policy("eu-standard-2026","欧洲区普通商品退货政策 2026","EU","STANDARD","2026-01-01","2027-01-01",true,14),
            policy("cn-draft-2026","未发布草稿：30 天退货","CN","STANDARD","2026-01-01","2027-01-01",false,30));
    }
    // demo:end documents
    private static Policy policy(String id,String title,String region,String category,String from,String to,boolean published,int days) {
        String text=title+"（虚构教学规则，不代表法律或真实商家承诺）。\n适用销售地区："+region+"；商品类别："+category+"；按购买日期选择适用版本。\n"+
            "退货条件：订单已签收，签收后 "+days+" 天内可有条件申请退货（按自然日差计算，签收当天为第 0 天；第 "+days+" 天仍可申请）；商品需保持完好并满足其他政策条件，且尚未申请售后。\n"+
            "操作步骤：订单详情 → 申请售后 → 退货退款。提交申请不代表审核通过。超过期限应联系人工客服，不能自动承诺可以退货。";
        // documentType 区分正式退货政策与未发布草稿；published 单独表示发布状态。
        return new Policy(id,title,published?"退货政策":"退货政策草稿",region,category,LocalDate.parse(from),LocalDate.parse(to),published,days,text);
    }
    // demo:start filter
    public static Scope scope(Order order,List<Policy> policies) {
        List<FilterRow> evaluations=new ArrayList<>();List<String> allowed=new ArrayList<>();
        for(Policy policy:policies) {
            List<String> reasons=new ArrayList<>();
            if(!policy.published()) reasons.add("未发布");
            if(!policy.region().equals(order.region())) reasons.add("销售地区不匹配");
            if(!policy.category().equals(order.category())) reasons.add("商品类别不匹配");
            if(order.purchasedAt().isBefore(policy.effectiveFrom()) || !order.purchasedAt().isBefore(policy.effectiveTo()))
                reasons.add("购买日期不在政策有效区间 [from, to)");
            if(reasons.isEmpty()) allowed.add(policy.id());
            evaluations.add(new FilterRow(policy.id(),policy.title(),reasons.isEmpty(),List.copyOf(reasons)));
        }
        return new Scope(List.copyOf(allowed),List.copyOf(evaluations),order.purchasedAt());
    }
    // demo:end filter
    // demo:start decision
    public static Eligibility evaluate(Order order,Fulfillment live,Scope scope,boolean hasEvidence) {
        var policies=all().stream().filter(p->scope.allowedDocumentIds().contains(p.id())).toList();
        // 不合并原因：无适用政策、多个适用政策、无检索证据是三种不同的教学分支。
        if(policies.isEmpty()) return new Eligibility("INSUFFICIENT_EVIDENCE",-1,0,"没有适用政策，无法确认能否退货","联系人工客服核实");
        if(policies.size()>1) return new Eligibility("INSUFFICIENT_EVIDENCE",-1,0,"存在多份适用政策，无法确认应使用哪一份","联系人工客服核实");
        if(!hasEvidence) return new Eligibility("INSUFFICIENT_EVIDENCE",-1,0,"没有检索到政策条款证据，无法确认能否退货","联系人工客服核实");
        int days=policies.get(0).returnDays();
        if(!live.observedAt().equals(DEMO_DATE) || live.orderId()!=order.id()) throw new IllegalStateException("履约状态过期或不匹配");
        if(live.afterSaleOpen()) return new Eligibility("ALREADY_REQUESTED",-1,days,"已申请售后，不能重复提交","在订单详情查看已有售后进度");
        if(!live.status().equals("DELIVERED") || live.signedAt()==null) return new Eligibility("NOT_DELIVERED",-1,days,"尚未签收，不能按签收后的退货规则判断","联系订单客服确认取消或拒收规则");
        long elapsed=java.time.temporal.ChronoUnit.DAYS.between(live.signedAt(),DEMO_DATE);
        if(elapsed<0) throw new IllegalStateException("签收日期在未来");
        if(elapsed>days) return new Eligibility("OUTSIDE_WINDOW",elapsed,days,"超过本教学政策的退货申请期限，不能承诺可以退货","联系人工客服");
        return new Eligibility("CONDITIONAL",elapsed,days,"仍在申请期限内；商品完好等条件未知，需用户确认","订单详情 → 申请售后 → 退货退款");
    }
    // demo:end decision
}
