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
        String text="# "+title+"\n\n虚构教学规则，不代表法律或真实商家承诺。适用销售地区："+region+"；商品类别："+category+"；按购买日期选择适用版本。\n\n"
            +"## 首次退货：申请条件\n\n普通商品已经签收，签收后 "+days+" 天内可有条件申请退货。按自然日差计算，签收当天为第 0 天，第 "+days+" 天仍可申请。商品需保持完好且尚未申请售后；商品完好等条件未核实，不可保证审核通过。\n\n"
            +"## 首次退货：提交申请\n\n首次申请退货退款：打开订单详情 → 申请售后 → 选择退货退款 → 填写退货原因并提交申请 → 等待商家审核及退货指引。尚未获得寄回指引时不要自行寄件。提交申请不代表退货或退款已经完成。\n\n"
            +"## 已申请退货：查询进度\n\n已经提交退货申请的用户，在订单详情 → 售后记录查看审核进度。若已有售后单，请继续处理原申请，不要再次点击申请售后新建重复退货单。此条用于已申请后的查询，不能判断首次申请资格。\n\n"
            +"## 审核通过：寄回商品\n\n退货申请审核通过后，在原售后单读取退货地址并预约寄件，填写快递公司与运单号。不要寄到商品原发货地址；收件地址以审核指引为准。寄回操作适用于已获批准的申请，不替代首次申请步骤。\n\n"
            +"## 退货完成：退款到账\n\n仓库验收通过并确认退款后，款项按原支付渠道退回。退款处理通常需要 3 至 7 个工作日。这里的 7 个工作日是到账等待时间，不是签收后允许申请退货的期限；退款进度在原售后单查看。\n\n"
            +"## 商品换货：更换规格\n\n希望更换颜色或尺码而不退回货款时，在订单详情的售后入口选择换货，填写希望更换的规格。换货受库存和专门审核条件限制；换货流程不能作为退货退款的申请步骤，也不能据此承诺退款。\n\n"
            +"## 商品维修：故障报修\n\n使用中出现故障可从订单详情 → 联系客服提交维修描述和照片，由服务人员核实保修范围。维修与退货退款是不同申请类型；仍在保修期不表示仍在退货申请期限内。\n\n"
            +"## 尚未签收：取消订单\n\n商品尚未签收时，应联系订单客服核实取消订单或拒收安排。取消操作取决于发货及拦截状态，不适用已经签收的商品；不能将取消订单入口当作签收后的退货退款入口。\n\n"
            +"## 超出期限：人工核实\n\n签收后超过本政策退货申请期限的订单，先联系人工客服核实是否存在其他处理依据。不要自动承诺可以退货，也不要把退款到账天数当作申请期限重新计算。\n\n"
            +"## 配送异常：查询物流\n\n已发货订单的配送轨迹在订单详情 → 查看物流中查询。运输延迟可联系物流客服催单。物流催单不会创建退货申请，配送预计到达时间也不能替代实际签收日期。\n\n"
            +"## 发票服务：开票与更正\n\n需要电子发票时，在订单详情 → 发票服务填写抬头并申请开票。发票信息错误需提交更正请求。开票、发票作废和退货退款分别处理，申请发票不改变售后申请状态。\n\n"
            +"## 账户服务：修改联系方式\n\n收件电话或账户联系方式有误时，通过账户设置或订单客服核实修改。已发货订单的收件信息可能无法直接更改。修改联系方式不会提交退货退款申请，也不延长退货期限。\n\n";
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
