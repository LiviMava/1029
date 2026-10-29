'use strict';
const $=id=>document.getElementById(id), base='/api/v1/tutorial/classic';
const tokenKey='zhixu.rag.accessToken';
const rememberedToken=sessionStorage.getItem(tokenKey)||'';
$('token').value=rememberedToken;
const steps=[
 ['documents','文档','Markdown 文件','读取本地资源','3 份文档','订单事实也来自文档快照；不查询业务数据库。'],
 ['parse','解析','文档字节','DocumentParser.parse()','正文 / 章节','解析把文件格式变成文本，供后续分块。'],
 ['chunk','分块','正文 / 章节','Chunker(220, 40)','Piece[]','每块 220 字符、重叠 40 字符；一块就是一条检索结果。'],
 ['embed','Embedding','Piece[].text','Spring AI · embed()','float[][]','每个片段生成一个向量；数字是坐标，单个维度没有业务含义。'],
 ['store','Milvus 入库','id + vector + text','Milvus · create / insert','独立 collection','向量用于相似度计算；原文与来源保存在动态字段，命中后一起返回。'],
 ['question','问题向量化','用户问题','同一个 Embedding 模型','float[]','问题和文档必须使用同一向量空间。'],
 ['search','向量检索','问题向量','Milvus · COSINE · Top 6','候选原文','用问题向量找相近片段。仅单路向量召回。'],
 ['rerank','重排','问题 + 候选原文','Reranker · Top 6','排序后的证据','重排再次比较问题和原文；分数是相关性，不是答案正确率。'],
 ['prompt','拼接 Prompt','问题 + 证据 [n]','system + user','Prompt.messages','把原文放进上下文，模型才有本次回答的依据。'],
 ['answer','生成回答','Prompt','Spring AI · ChatModel.call()','回答 + 引用','按文档快照判断；核查是否回答了“能否申请”和“如何操作”。']
];
let selected=0,run=null,traces={},busy=false;const codes=new Map();
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
async function api(path,method='GET',body){const headers={'Content-Type':'application/json'};const token=sessionStorage.getItem('zhixu.rag.accessToken');if(token)headers.Authorization='Bearer '+token;const r=await fetch(base+path,{method,headers,credentials:'same-origin',body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(180000)});const data=await r.json();if(!r.ok)throw Error(data.detail||data.message||'请求失败');return data;}
function card(title,text,cls){const c=el('section',undefined,'data');c.append(el('h3',title));if(text!==undefined)c.append(el('p',text,cls));$('result').append(c);return c;}
function vector(v,i){const c=card(`向量 ${i+1} · ${v.dimensions} 维`),grid=el('div',undefined,'vectors');v.first8.forEach((x,j)=>{const cell=el('span',Number(x).toFixed(4),x<0?'neg':'');cell.prepend(el('small','d'+j));grid.append(cell);});c.append(grid,el('small','仅展示前 8 维；检索使用完整向量。'));}
function hits(list){list.forEach((h,i)=>{const c=card(`#${i+1} · ${h.filename}`);c.append(el('p','score '+Number(h.score).toFixed(5),'score'),el('blockquote',h.text));});if(!list.length)card('候选','没有检索到片段。');}
function results(t){$('result').replaceChildren();if(!t){$('result').append(el('div','○ 运行这一步，查看真实输出','empty'));return;}const o=t.output;
 switch(t.node){
 case 'documents':o.forEach(d=>card(d.filename,d.text));break;
 case 'parse':o.forEach(d=>{const c=card(d.source);d.sections.forEach(s=>c.append(el('blockquote',s.text)));});break;
 case 'chunk':o.forEach(p=>card(`片段 ${p.id} · ${p.source} · ${p.text.length} 字符`,p.text));break;
 case 'embed':case 'question':o.forEach(vector);break;
 case 'store':card('Milvus 已写入',JSON.stringify(o,null,2));break;
 case 'search':case 'rerank':hits(o);break;
 case 'prompt':o.forEach(m=>card(m.role,m.content));break;
 case 'answer':card('模型回答',o.answer,'answer');const c=card('本轮引用原文');(o.citations||[]).forEach((h,i)=>{const d=el('details');d.append(el('summary',`[${i+1}] ${h.filename}`),el('blockquote',h.text));c.append(d);});if(o.note)c.append(el('small',o.note));break;
 }
}
async function showCode(id){if(!codes.has(id))codes.set(id,await api('/code/'+id));if(steps[selected][0]===id)$('code').textContent=codes.get(id).text;}
function renderProgress(){
 const box=$('answer-progress');box.replaceChildren();
 const rows=[['订单事实',traces.documents?'已读取订单快照，查看原文核对签收与售后状态':'等待读取订单快照'],['政策依据',traces.search?'已检索到候选；需核对是否支持期限与步骤':'等待检索退货政策'],['条件判断',traces.answer?'见本轮模型回答；商品完好等条件仍需核实':'等待证据与回答'],['操作步骤',traces.answer?'见本轮回答，并对照引用原文核查':'等待政策中的操作路径']];
 rows.forEach(([k,v])=>box.append(el('p',k+'：'+v)));
}
function render(){renderProgress();const s=steps[selected],t=traces[s[0]];
 ['ingest','query'].forEach(id=>$(id).replaceChildren());steps.forEach((s,i)=>{const b=el('button',undefined,(i===selected?'active ':'')+(traces[s[0]]?'done':''));b.append(el('span',traces[s[0]]?'✓':String(i+1).padStart(2,'0'),'step-num'),el('span',s[1]));b.disabled=busy;b.onclick=()=>{selected=i;render();};$(i<5?'ingest':'query').append(b);});
 $('number').textContent=`${selected<5?'建库':'问答'} / ${selected+1} OF 10`;$('title').textContent=s[1];$('reason').textContent=s[5];$('flow').replaceChildren();s.slice(2,5).forEach((v,i)=>{if(i)$('flow').append(el('span','→','flow-arrow'));const b=el('div',undefined,'flow-box');b.append(el('small',['INPUT','JAVA / SERVICE','OUTPUT'][i]),el('strong',v));$('flow').append(b);});
 results(t);$('input').textContent=t?JSON.stringify(t.input,null,2):'等待执行';$('output').textContent=t?JSON.stringify(t.output,null,2):'等待执行';$('timing').textContent=t?`${t.elapsedMs} ms · 真实执行`:'';
 $('execute').disabled=busy||!run||!!t||selected!==Object.keys(traces).length;$('execute').textContent=t?'✓ 已完成':'运行这一步 →';$('create').disabled=busy||!!run;$('question').disabled=busy||!!run;$('clear').disabled=busy||!run;$('all').disabled=busy||!run||Object.keys(traces).length===10;$('prev').disabled=busy||selected===0;$('next').disabled=busy||selected===9;
 $('code').textContent='载入源码…';showCode(s[0]).catch(e=>$('code').textContent=e.message);
}
async function action(fn){busy=true;$('error').hidden=true;render();try{await fn();}catch(e){$('error').textContent=e.message;$('error').hidden=false;}finally{busy=false;render();}}
async function execute(){const s=steps[selected];const t=await api(`/runs/${run.runId}/${s[0]}`,'POST');traces[s[0]]=t;}
$('create').onclick=()=>action(async()=>{run=await api('/runs','POST',{question:$('question').value});traces={};selected=0;sessionStorage.setItem('classic.run',run.runId);});
$('clear').onclick=()=>action(async()=>{try{await api('/runs/'+run.runId,'DELETE');}catch(e){if(!/实验不存在/.test(e.message))throw e;}run=null;traces={};selected=0;sessionStorage.removeItem('classic.run');});
$('execute').onclick=()=>action(execute);$('all').onclick=()=>action(async()=>{for(let i=0;i<10;i++)if(!traces[steps[i][0]]){selected=i;render();await execute();}});
$('prev').onclick=()=>{selected--;render();};$('next').onclick=()=>{selected++;render();};
$('gateway').onclick=async()=>{const view=$('gateway-code');try{if(!view.textContent)view.textContent=(await api('/code/spring-ai')).text;view.hidden=!view.hidden;}catch(e){view.hidden=false;view.textContent=e.message;}};
$('save-token').onclick=()=>{sessionStorage.setItem(tokenKey,$('token').value.trim());location.reload();};
(async()=>{render();try{const c=await api('/config');$('connection').textContent=[['Milvus',c.milvusAvailable],['Embedding',c.embeddingConfigured],['重排',c.rerankConfigured],['Chat',c.chatConfigured]].map(([k,v])=>`${v?'●':'○'} ${k}${v?' 已连接 / 已配置':' 待连接 / 待配置'}`).join('　');const saved=sessionStorage.getItem('classic.run');if(saved){try{const state=await api('/runs/'+saved);run={runId:saved};traces=state.traces;$('question').value=state.question;selected=Math.min(Object.keys(traces).length,9);}catch{sessionStorage.removeItem('classic.run');}}render();}catch(e){$('error').hidden=false;$('error').textContent=e.message;}})();
