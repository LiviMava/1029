/* Actual server traces only: no fabricated model output or success animation. */
'use strict';
const $ = id => document.getElementById(id);
const base = '/api/v1/tutorial/orders';
let config, selected = 0, run = null, traces = {}, busy = false, busyText = '', restoreNotice = '', renderedIndex = -1;
const codes = new Map();
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
const para = (text, cls) => el('p', text, cls);
const regionLabel = v => v === 'CN' ? '中国区' : v === 'EU' ? '欧洲区' : v;
const categoryLabel = v => v === 'STANDARD' ? '普通商品' : v === 'DIGITAL' ? '数字商品' : v;
async function api(path, method = 'GET', body) {
  const headers = {'Content-Type':'application/json'};
  const token = sessionStorage.getItem('zhixu.rag.accessToken');
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(base + path, {method, headers, credentials:'same-origin', body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(180000)});
  const raw = await response.text(); let data;
  try { data = JSON.parse(raw); } catch { data = {message:raw}; }
  if (!response.ok) throw new Error(`${response.status} · ${data.detail || data.message || data.error || '请求失败'}`);
  return data;
}
function object(parent, value, label = '对象', depth = 0, itemLabel = '') {
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value), details = el('details'), summary = el('summary', `${label} · ${Array.isArray(value) ? entries.length + ' 项' : '对象'}`);
    details.open = depth < 2; details.append(summary);
    if (!entries.length) details.append(el('p', Array.isArray(value) ? '[]（没有候选）' : '{}', 'object-empty'));
    entries.forEach(([key, child]) => object(details, child, Array.isArray(value) && itemLabel ? `${itemLabel} ${Number(key) + 1}` : key, depth + 1, itemLabel)); parent.append(details);
  } else {
    const row = el('div', undefined, 'object-field'); row.append(el('span', label + ': ', 'object-key'), document.createTextNode(value === null ? 'null' : String(value))); parent.append(row);
  }
}
const PHASES = [
  {label:'原始文档', hint:'查看待入库的政策文本及适用条件', ids:['documents']},
  {label:'离线准备', hint:'为本实验建立政策检索库', ids:['prepare']},
  {label:'① 取业务事实', hint:'确认订单归属，查询订单与履约状态', ids:['question','sql','api']},
  {label:'② 筛政策 + 检索条款', hint:'先选适用政策，再查相关条款', ids:['filter','keyword','vector','fusion','rerank']},
  {label:'③ 判断 + 回答', hint:'应用规则给出判断，模型组织解释', ids:['prompt','answer']}
];
const SUBTITLES = {documents:'政策原文与适用条件',prepare:'政策文本 → 检索库',question:'问题 → 订单号',sql:'订单号 → 订单事实',api:'订单号 → 签收/售后状态',filter:'5 份政策 → 适用政策',keyword:'适用政策 → 关键词候选',vector:'适用政策 → 语义候选',fusion:'两路候选 → 合并',rerank:'候选 → 相关性排序',prompt:'事实 + 证据 → 规则判断 + 模型输入',answer:'模型输入 → 回答 + 引用'};
const RAW_LABELS = {
  documents:['读取参数（无文档输入）','Policy[]（5 份政策文档）'],
  prepare:['5 份政策文档（Policy[]）','建库结果（Knowledge：结构化 + 向量）'],
  question:['问题与演示用户','Intent（解析结果）'],
  sql:['Intent + SQL + 参数','Order（订单事实）'],
  api:['Order + 请求 URL','Fulfillment（签收与售后状态）'],
  filter:['Order + Policy[]','Scope（适用政策）'],
  keyword:['Scope + Query','Recall（关键词候选）'],
  vector:['Scope + Query','Recall（语义候选）'],
  fusion:['两路 Recall','TutorialFusion.Result（合并结果）'],
  rerank:['合并结果','Ranking（相关性排序）'],
  prompt:['事实 + 证据','PromptData（规则判断 + 模型输入）'],
  answer:['PromptData','Answer（回答与引用）']
};
const RAW_LEGENDS = {
  documents:{input:'这一步不需要外部输入；直接读取教学内置的政策目录。政策文本由应用内置，B 步骤写成临时 .md 后解析。',
    output:[['id','政策 ID'],['title','文档标题'],['documentType','文档类型（退货政策 / 退货政策草稿）'],['region','销售地区'],['category','商品类别'],['effectiveFrom / effectiveTo','生效区间'],['published','是否已发布'],['returnDays','退货申请期限（天）'],['text','政策原文']]},
  prepare:{input:'Policy[]：政策文档数组。每个对象是一份文档，text 是政策原文，title 是文档标题。',
    note:'Knowledge 是 B 步骤的教学聚合对象，不是 Qdrant 的单条记录：policies/chunks 是结构化文本，points 是 Qdrant 点（vector + payload），database 是集合统计。地区、品类、有效期等筛选元数据在应用侧，不在 Qdrant payload 里。B 只建立向量检索库；G 会在适用政策片段上临时构建 BM25 索引，两路使用相同的片段 ID。',
    output:[['policies','政策文档原文（与输入相同，便于对照）'],['chunks','文本片段：id 是片段 ID，documentId 所属政策，chunkIndex 文档内序号，text 原文；同一 id 用于关键词和向量两路'],['points','Qdrant 点预览（point = id + vector + payload）：chunkId 对应片段，documentId 所属政策，first8 是向量前 8 维'],['database','Qdrant 集合统计：collection 集合名，pointsCount 点数，dimensions 维度，distance 距离函数']]},
  question:{input:'question：用户原始问题；serverPrincipal：服务端固定的演示用户。',
    output:[['orderId','从问题中提取的订单号'],['customerId','服务端固定的演示用户，不从问题文本采信'],['question','用户原始问题'],['asOf','固定教学日期']]},
  sql:{input:'request：上一步 Intent；sql：代码里写死的参数化 SQL；parameters：订单号和 customerId。',
    output:[['id','订单号'],['region','销售地区'],['category','商品类别'],['model','商品型号'],['purchasedAt','购买日期']]},
  api:{input:'order：订单事实；method：请求方法；url：应用启动的本地 mock 服务地址。',
    output:[['status','履约状态：DELIVERED（已签收）/ IN_TRANSIT（仍在运输）'],['signedAt','签收日期'],['afterSaleOpen','是否已申请售后'],['source','数据来源说明']]},
  filter:{input:'order：订单事实；policies：5 份候选政策。',
    output:[['allowedDocumentIds','筛完后适用的政策 ID'],['evaluations','每份政策的纳入/排除原因'],['policyDate','用于选择政策版本的购买日期']]},
  keyword:{input:'scope：适用政策范围；query：检索用问题。',
    output:[['hits','BM25 命中的片段，score 是关键词分数；本步骤在适用政策片段上临时建索引'],['filter','记录范围过滤条件']]},
  vector:{input:'scope：适用政策范围；query：检索用问题。',
    output:[['hits','Qdrant 命中的片段，score 是 Cosine 相似度'],['queryVector','问题向量的维度与前 8 维预览'],['filter','Qdrant 的 documentId 过滤条件']]},
  fusion:{input:'keyword 和 vector：两路 Recall 结果。',
    output:[['hits','RRF 融合后的候选片段'],['contributions','每个候选在两路中的名次和 RRF 贡献'],['candidateCount','两路去重后的候选数']]},
  rerank:{input:'上一步 RRF 融合结果。',
    output:[['before','重排前的候选'],['hits','重排后的候选，score 是相关性分数'],['scoreType','分数类型（如 RAW_RELEVANCE）'],['model','重排模型名']]},
  prompt:{input:'intent、order、fulfillment、scope、ranked：前面各步的结果。',
    output:[['eligibility','应用规则给出的判断（不等于最终审核结论）'],['evidence','传给模型的政策证据及引用编号'],['messages','system 和 user 两条模型输入消息']]},
  answer:{input:'PromptData：上一步组装好的模型输入。',
    output:[['answer','模型生成的回答正文'],['citations','回答引用的政策证据'],['citationNumbersValid','[n] 引用编号是否越界'],['generationMode','LIVE_CHAT 或 NO_EVIDENCE_NO_MODEL_CALL'],['warning','引用校验的边界说明：只检查编号，不验证内容']]}
};
function diagram() {
  const wrap = el('div', undefined, 'phase-list');
  const indexOf = id => config.nodes.findIndex(n => n.id === id);
  PHASES.forEach(phase => {
    const box = el('section', undefined, 'phase');
    const head = el('div', undefined, 'phase-head');
    head.append(el('span', phase.label, 'phase-label'), el('span', phase.hint, 'phase-hint'));
    const row = el('div', undefined, 'phase-nodes');
    phase.ids.forEach(id => {
      const i = indexOf(id), node = config.nodes[i];
      if (!node) return;
      const chip = el('button', undefined, 'node-chip'); chip.type = 'button';
      if (i === selected) chip.classList.add('selected');
      if (traces[id]) chip.classList.add('done');
      if (busy && i === selected) chip.classList.add('running');
      chip.setAttribute('aria-pressed', String(i === selected));
      const [letter, ...rest] = node.title.split(' ');
      chip.append(el('span', letter, 'chip-letter'), el('span', rest.join(' '), 'chip-title'), el('span', SUBTITLES[id] || node.objectType, 'chip-sub'));
      chip.onclick = () => { if (!busy) { selected = i; render(); } };
      row.append(chip);
    });
    box.append(head, row); wrap.append(box);
  });
  $('pipeline').replaceChildren(wrap);
}
function card(title) { const c=el('section',undefined,'data-card');c.append(el('h3',title));$('highlights').append(c);return c; }
function hitList(c,hits,scoreLabel,limit=3){
  if(!hits || !hits.length){c.append(para('没有候选。','muted'));return;}
  hits.slice(0,limit).forEach((h,i)=>{
    const row=el('div',undefined,'hit-row');
    row.append(el('p',`#${i+1} · ${h.section || h.documentId} · ${scoreLabel} ${Number(h.score).toFixed(4)}`,'row-scores'));
    const text=String(h.text || '');
    row.append(el('p',text.length>220?text.slice(0,220)+'…':text,'hit-text'));
    c.append(row);
  });
  if(hits.length>limit)c.append(para(`共 ${hits.length} 条候选；原始数据里有完整列表。`,'muted'));
}
function rawLegend(trace){
  const box=$('raw-legend');box.replaceChildren();
  if(!trace)return;
  const legend=RAW_LEGENDS[trace.node];
  if(!legend){box.append(para('左侧是输入，右侧是输出；字段名对应 Java record。','muted'));return;}
  if(legend.input)box.append(para(`输入：${legend.input}`));
  if(legend.note)box.append(para(legend.note,'muted'));
  if(legend.output && legend.output.length){
    box.append(para('输出字段：','raw-legend-title'));
    const ul=el('ul',undefined,'raw-legend-list');
    legend.output.forEach(([field,meaning])=>{const li=el('li');li.append(el('code',field),document.createTextNode('：'+meaning));ul.append(li);});
    box.append(ul);
  }
}
function highlights(trace) {
  $('highlights').replaceChildren();
  if(!trace){$('highlights').append(para('运行这一步后，这里先给出关键结果。','object-empty'));return;}
  const out=trace.output;
  if(trace.node==='documents'){
    const c=card('政策原文与适用条件');
    c.append(para(`共 ${out.length} 份政策文档。先比较地区、年份和发布状态，再展开原文。政策文本由应用内置，B 步骤写成临时 Markdown 后解析。`));
    out.forEach((p,i)=>{
      const d=el('details',undefined,'doc-card');d.open=i===0;
      d.append(el('summary',`${i+1}. 《${p.title}》 · 文档类型：${p.documentType||'政策'} · ${regionLabel(p.region)} · ${categoryLabel(p.category)} · ${p.published?'已发布':'未发布'} · 生效 ${p.effectiveFrom} 至 ${p.effectiveTo}`));
      d.append(para(`政策 ID：${p.id} · 文档类型：${p.documentType||'政策'} · 解析格式：Markdown（B 步骤写成 .md 后解析） · 退货申请期限：${p.returnDays} 天`,'muted'),el('blockquote',p.text,'policy-text'));
      c.append(d);
    });
  } else if(trace.node==='prepare'){
    const c=card('政策检索库已建立');
    c.append(para(`已处理 ${out.policies.length} 份政策，生成 ${out.chunks.length} 个片段，并写入 ${out.points.length} 个向量点。`));
    c.append(para('每个片段保留所属政策标识，后续可按适用政策限定检索范围。'));
    const dbDetail=el('details',undefined,'inline-details');dbDetail.append(el('summary','向量化、索引与存储细节'));
    const dbTable=el('table',undefined,'detail-table');
    const addRow=(k,v)=>{const tr=el('tr');tr.append(el('th',k),el('td',v));dbTable.append(tr);};
    addRow('集合名',out.database.collection);addRow('向量点数',String(out.database.pointsCount));addRow('向量维度',String(out.database.dimensions));addRow('距离函数',out.database.distance);
    addRow('向量数据',`point.vector：${out.database.dimensions} 个浮点数，检索时算 Cosine`);
    addRow('结构化数据','point.id、payload.documentId、payload.text');
    addRow('范围元数据','region/category/有效期/published 在应用侧，用于先筛政策范围');
    dbDetail.append(para(`每份文档按 180 个字符窗口、30 个字符重叠切块；每个片段生成一个 ${out.database.dimensions} 维向量。`,'muted'));
    dbDetail.append(para(`Qdrant 不是只存向量：每个 point 同时包含 id（结构化标识）、vector（${out.database.dimensions} 维向量）和 payload（documentId、原文）。`,'muted'));
    dbDetail.append(para('B 只建立向量检索库；G 会在适用政策片段上临时构建 BM25 索引，两路使用相同的片段 ID。','muted'));
    dbDetail.append(para('集合名是自动生成的：前半段是本次实验的随机标识，后半段是 Embedding 配置签名；不同实验或不同 Embedding 配置不会混在一起。','muted'),dbTable);
    c.append(dbDetail);
    if(out.points.length){
      const policyTitle=new Map((out.policies||[]).map(p=>[p.id,p.title]));
      const chunkById=new Map((out.chunks||[]).map(ch=>[ch.id,ch]));
      const labelFor=(pt,i)=>{const title=policyTitle.get(pt.documentId)||pt.documentId;const chunk=chunkById.get(pt.chunkId);return `《${title}》 · ${chunk?`第 ${chunk.chunkIndex+1} 段`:`第 ${i+1} 个点`}`;};
      const detail=el('details',undefined,'inline-details');detail.append(el('summary','看看其中一个片段、它属于哪份文档，以及向量前 8 维'));
      const select=el('select');out.points.forEach((pt,i)=>{const o=el('option',labelFor(pt,i));o.value=i;select.append(o);});
      const picker=el('div',undefined,'chunk-picker');
      const pickerLeft=el('div',undefined,'chunk-picker-side');
      const pickerRight=el('div',undefined,'chunk-picker-side');
      pickerLeft.append(para('选择片段：','raw-legend-title'),select);
      const textBox=el('div');
      pickerRight.append(para('payload.text 原文：','raw-legend-title'),textBox);
      picker.append(pickerLeft,pickerRight);
      const view=el('div');
      const show=()=>{
        view.replaceChildren();
        const pt=out.points[Number(select.value)];if(!pt)return;
        textBox.replaceChildren(el('blockquote',pt.text,'policy-text'));
        const chunk=chunkById.get(pt.chunkId),title=policyTitle.get(pt.documentId)||pt.documentId;
        const policy=(out.policies||[]).find(p=>p.id===pt.documentId);
        view.append(para(`这个点属于《${title}》，是原文切出来的${chunk?`第 ${chunk.chunkIndex+1} 段`:'一个片段'}。`));
        if(policy)view.append(para(`文档信息：文档类型：${policy.documentType||'政策'} · ${regionLabel(policy.region)} · ${categoryLabel(policy.category)} · 生效 ${policy.effectiveFrom} 至 ${policy.effectiveTo} · 退货申请期限：${policy.returnDays} 天 · ${policy.published?'已发布':'未发布'}。`,'muted'));
        const vals=pt.first8.map((v,i)=>`d${i}=${Number(v).toFixed(5)}`);
        const lines=[];for(let i=0;i<vals.length;i+=4)lines.push('      '+vals.slice(i,i+4).join(', '));
        const structure=[
          '{',
          `  "id": "${pt.chunkId}",`,
          '  "vector": [',
          ...lines.map(l=>l+','),
          `      // d${pt.first8.length} … d${pt.dimensions-1} 省略，共 ${pt.dimensions} 维`,
          '  ],',
          '  "payload": {',
          `    "documentId": "${pt.documentId}",`,
          '    "text": "……（片段原文见上方）"',
          '  }',
          '}'
        ].join('\n');
        view.append(para('这个片段在 Qdrant 里就是一个 point（下面是简化结构，注释是讲解，不是实际 JSON）：','raw-legend-title'),el('pre',structure,'qdrant-structure'));
        view.append(para('结构说明：','raw-legend-title'));
        const ul=el('ul',undefined,'raw-legend-list');
        [['id','point 的唯一标识，用于去重和更新。'],
         ['vector',`${pt.dimensions} 个浮点数就是 ${pt.dimensions} 个坐标；合起来表示这段文本在 ${pt.dimensions} 维空间中的一个点。`],
         ['payload.documentId','这个点属于哪份政策。'],
         ['payload.text','片段原文；随 point 保存，检索命中时返回，但不参与向量距离计算。']
        ].forEach(([k,v])=>{const li=el('li');li.append(el('code',k),document.createTextNode('：'+v));ul.append(li);});
        view.append(ul);
        view.append(para('注意：d0、d1 这些单独的数字没有“价格/地区”这种业务含义；检索时比较的是问题向量与这个点的夹角（Cosine），不是逐个解释坐标。','muted'));
      };
      select.onchange=show;detail.append(picker,view);show();c.append(detail);
    }
  } else if(trace.node==='question'){
    const c=card('从问题里取到订单号');
    c.append(para(`订单号：${out.orderId}`),para(`演示用户：${out.customerId}（服务端固定，不从问题文本采信）`,'muted'));
  } else if(trace.node==='sql'){
    const c=card('查到订单事实'),table=el('table',undefined,'detail-table');
    const add=(k,v)=>{const tr=el('tr');tr.append(el('th',k),el('td',v));table.append(tr);};
    add('订单号',String(out.id));
    add('销售地区',regionLabel(out.region));
    add('商品类别',categoryLabel(out.category));
    add('型号',out.model);add('购买日期',out.purchasedAt);
    c.append(table,para('SQL 是 DemoOrderRepository 里写死的常量，不是模型生成；参数是订单号和服务端用户。','muted'));
  } else if(trace.node==='api'){
    const c=card('查到履约状态');
    const state=out.status==='DELIVERED'?'已签收':out.status==='IN_TRANSIT'?'仍在运输':out.status;
    c.append(para(`状态：${state} · 签收日期：${out.signedAt || '—'} · 已申请售后：${out.afterSaleOpen ? '是' : '否'}`));
    if(trace.input && trace.input.url)c.append(para(`请求地址：${trace.input.url}（应用启动的本地 mock 服务生成，不是用户输入）`,'muted'));
  } else if(trace.node==='filter'){
    const c=card(`5 份政策 → ${out.allowedDocumentIds.length} 份适用`),table=el('table',undefined,'filter-table');
    const head=el('tr');head.append(el('th','政策'),el('th','筛选结果'),el('th','原因'));table.append(head);
    const reasonText=r=>{
      if(r.included)return '已发布；地区、品类和购买日期均匹配';
      return r.reasons.map(x=>x==='购买日期不在政策有效区间 [from, to)'?'购买日期不在该版本的生效区间':x).join('；')||'—';
    };
    out.evaluations.forEach(r=>{
      const tr=el('tr'),name=el('td');
      name.append(el('div',r.title),el('div',`（${r.policyId}）`,'muted'));
      tr.append(name,el('td',r.included?'纳入':'排除',r.included?'included':'excluded'),el('td',reasonText(r)));table.append(tr);
    });
    c.append(table,para('适用版本由购买日期决定，不一定是最新版本。签收日期用于计算申请期限。','muted'));
  } else if(trace.node==='keyword'){
    const c=card('关键词检索（Lucene BM25）');hitList(c,out.hits,'BM25 分数');c.append(para('BM25 分数没有固定区间，不是概率；本步骤在适用政策片段上临时构建索引。','muted'));
  } else if(trace.node==='vector'){
    const c=card('向量检索（Qdrant 过滤）');hitList(c,out.hits,'Cosine 相似度');c.append(para('范围过滤在 Top-K 之前执行；分数不能和 BM25 相加。','muted'));
  } else if(trace.node==='fusion'){
    const c=card('合并两路候选（RRF）');
    (out.contributions || []).slice(0,4).forEach(r=>c.append(el('p',`${r.hit.section || r.hit.id}：关键词 #${r.keywordRank ?? '—'} + 向量 #${r.vectorRank ?? '—'} → RRF ${Number(r.fusedScore).toFixed(4)}`,'row-scores')));
    c.append(para('按名次计算融合分数，不直接相加原始分数。','muted'));
  } else if(trace.node==='rerank'){
    const c=card(`按相关性重排 · ${out.model || ''}`);hitList(c,out.hits,`${out.scoreType || '相关性'} 分数`);c.append(para('分数反映相关性，不代表政策适用性或答案正确率。','muted'));
  } else if(trace.node==='prompt'){
    const c=card('规则判断与准备模型输入'),e=out.eligibility;
    c.append(el('p',`${e.status} · ${e.reason}`,'decision'),para(e.action));
    if(e.status==='CONDITIONAL'){
      const table=el('table',undefined,'detail-table');
      const add=(k,v)=>{const tr=el('tr');tr.append(el('th',k),el('td',v));table.append(tr);};
      add('已确认',`已签收；签收后经过 ${e.signedDays} 天；适用 ${e.returnDays} 天期限；未申请售后`);
      add('尚未确认','商品是否完好、是否满足其他政策条件');
      c.append(para('关键对照：','raw-legend-title'),table);
      c.append(para('满足已知的申请条件；确认商品完好并满足其他政策条件后，可按页面路径提交申请。提交申请不代表审核通过。'));
    }
    c.append(para(`模型输入包含：问题、订单事实、履约状态、规则判断、${out.evidence.length} 条政策证据。`));
    if(e.returnDays>0)c.append(para('本例中的申请期限来自政策的结构化字段 returnDays，不是由语言模型从条款中提取。政策正文用于检索、解释和引用。','muted'));
    c.append(para('规则判断由应用代码执行，同样的输入会得到同样的结果；商品是否完好等未知条件仍需核实。','muted'));
  } else if(trace.node==='answer'){
    const c=card('生成带引用的回答');c.append(el('div',out.answer,'answer'),para(out.warning,'muted'));
  }
}
function showCode(code) {
  $('code-path').textContent=code.path;$('java-code').replaceChildren();
  code.text.split('\n').forEach((line,i)=>{const span=el('span',line||' ','code-line');span.dataset.line=i+1;$('java-code').append(span);});
}
async function loadCode(nodeId){
  if(codes.has(nodeId)){showCode(codes.get(nodeId));return;}
  $('java-code').textContent='正在读取本次构建的 Java 源码…';
  try{const code=await api('/code/'+nodeId);codes.set(nodeId,code);if(config.nodes[selected].id===nodeId)showCode(code);}
  catch(e){if(config.nodes[selected].id===nodeId)$('java-code').textContent=e.message;}
}
function statusText(){
  const done=Object.keys(traces).length;
  if(done===config.nodes.length)return `${config.nodes.length} 步已全部完成。可以回看任意一步，或换一个订单对比。`;
  const next=config.nodes.find(n=>!traces[n.id]);
  return `已完成 ${done}/${config.nodes.length} 步 · 下一步：${next.title}`;
}
function clearResults(){
  $('progress').textContent='尚未创建实验';
  $('node-type').textContent='';
  $('node-title').textContent='';
  $('boundary').textContent='';
  $('explanation').textContent='';
  $('timing').textContent='';
  $('highlights').replaceChildren();
  $('input').replaceChildren();
  $('output').replaceChildren();
  $('raw-legend').replaceChildren();
  $('java-code').textContent='';
  $('code-path').textContent='';
  $('node-detail').hidden=true;
  $('export').hidden=true;
  renderedIndex=-1;
}
async function render() {
  document.body.classList.toggle('run-active', !!run);
  $('create').disabled=busy||!!run;
  $('clear').disabled=busy||!run;
  $('question').disabled=busy||!!run;
  $('scenario').disabled=busy||!!run;
  if(!run){
    clearResults();
    $('execute').disabled=true;$('next-step').disabled=true;$('run-all').disabled=true;$('export').disabled=true;
    $('previous').disabled=true;$('next').disabled=true;
    $('status').classList.toggle('warning', !busy && !!restoreNotice);
    $('status').textContent=busy?(busyText||'正在创建或清理实验…'):(restoreNotice||'选择订单 → 创建实验 → 逐步运行。');
    return;
  }
  const node=config.nodes[selected],trace=traces[node.id];diagram();
  $('node-detail').hidden=!trace;
  $('export').hidden=Object.keys(traces).length===0;
  $('progress').textContent=`第 ${selected+1} / ${config.nodes.length} 步`;
  $('node-type').textContent=trace?`已完成 · ${trace.elapsedMs} ms`:'尚未运行';
  $('node-title').textContent=node.title;
  $('boundary').textContent=node.boundary || '—';
  $('explanation').textContent=node.explanation || '';
  $('timing').textContent=trace?`${trace.elapsedMs} ms`:'';
  if(renderedIndex!==selected){
    $('raw-panel').open=false;$('code-panel').open=false;
    $('java-code').textContent='展开后载入当前构建的源码…';$('code-path').textContent='';
    renderedIndex=selected;
  }
  ['input','output'].forEach(id=>{
    $(id).replaceChildren();
    if(trace){
      const labels=RAW_LABELS[trace.node]||['输入包','输出包'];
      const label=labels[id==='input'?0:1];
      if((trace.node==='prepare'&&id==='input')||(trace.node==='documents'&&id==='output'))object($(id),trace[id],label,0,'文档');
      else object($(id),trace[id],label);
    } else $(id).append(el('p','运行这一步后展示真实数据，不预填示例。','object-empty'));
  });
  rawLegend(trace);
  highlights(trace);
  $('previous').disabled=busy||selected===0;$('next').disabled=busy||selected===config.nodes.length-1;
  $('execute').disabled=busy||(selected>0&&!traces[config.nodes[selected-1].id]);
  $('next-step').disabled=busy||!trace||selected===config.nodes.length-1;
  $('run-all').disabled=busy;
  $('export').disabled=busy||!Object.keys(traces).length;
  $('status').classList.remove('warning');
  $('status').textContent=busy?(busyText||`正在运行「${node.title}」…`):statusText();
  if(trace)codes.set(node.id,trace.javaCode);
  if($('code-panel').open)loadCode(node.id);
}
async function action(work,text=''){$('error').hidden=true;busy=true;busyText=text;render();try{await work();}catch(e){$('error').textContent=e.message;$('error').hidden=false;}finally{busy=false;busyText='';render();}}
async function execute(i){selected=i;for(let j=i;j<config.nodes.length;j++)delete traces[config.nodes[j].id];render();const trace=await api(`/runs/${run.runId}/${config.nodes[i].id}`,'POST');traces[trace.node]=trace;codes.set(trace.node,trace.javaCode);}
$('previous').onclick=()=>{selected--;render();};$('next').onclick=()=>{selected++;render();};
$('next-step').onclick=()=>{if(!busy&&selected<config.nodes.length-1){selected++;render();}};
$('scenario').onchange=()=>{$('question').value=`我的订单 ${$('scenario').value} 现在能退货吗？如果可以，该怎么操作？`;};
$('create').onclick=()=>action(async()=>{restoreNotice='';run=await api('/runs','POST',{question:$('question').value});traces={};selected=0;renderedIndex=-1;sessionStorage.setItem('orderTutorial.run',run.runId);},'正在创建实验…');
$('clear').onclick=()=>action(async()=>{try{await api('/runs/'+run.runId,'DELETE');}catch(e){if(!/^(404|410)/.test(e.message))throw e;}restoreNotice='';run=null;traces={};selected=0;renderedIndex=-1;sessionStorage.removeItem('orderTutorial.run');const id=$('scenario').value||'123';$('question').value=`我的订单 ${id} 现在能退货吗？如果可以，该怎么操作？`;},'正在清理实验…');
$('execute').onclick=()=>action(()=>execute(selected));
$('run-all').onclick=()=>action(async()=>{for(let i=0;i<config.nodes.length;i++)if(!traces[config.nodes[i].id])await execute(i);},'正在依次运行剩余步骤…');
$('code-panel').addEventListener('toggle',()=>{if($('code-panel').open)loadCode(config.nodes[selected].id);});
$('copy-code').onclick=async()=>{const node=config.nodes[selected];if(!codes.has(node.id))await loadCode(node.id);const code=codes.get(node.id);if(!code){$('error').textContent='代码尚未载入，请稍后再试。';$('error').hidden=false;return;}try{await navigator.clipboard.writeText(code.text);$('copy-code').textContent='已复制';setTimeout(()=>$('copy-code').textContent='复制代码',1200);}catch{$('error').textContent='无法访问剪贴板，请手动选择代码复制。';$('error').hidden=false;}};
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({run,traces},null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='order-rag-traces.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
(async()=>{try{
  config=await api('/config');$('demo-date').textContent=config.demoDate;
  config.scenarios.forEach(s=>{const option=el('option',s.label);option.value=s.id;$('scenario').append(option);});
  const saved=sessionStorage.getItem('orderTutorial.run');if(saved){try{const state=await api('/runs/'+saved);run={runId:state.runId,question:state.question};traces=state.stages;$('question').value=state.question;selected=Math.min(Object.keys(traces).length,config.nodes.length-1);}catch{sessionStorage.removeItem('orderTutorial.run');restoreNotice='上次实验已失效（服务重启或超过 30 分钟），请重新创建实验。';}}
  render();
}catch(e){$('status').textContent='教学服务未连接';$('error').textContent=e.message;$('error').hidden=false;}})();
