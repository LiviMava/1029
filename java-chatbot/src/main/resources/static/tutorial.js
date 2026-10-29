(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const themeKey='zhixu.rag.theme';
  const systemTheme=window.matchMedia('(prefers-color-scheme: dark)');
  let preferredTheme;
  try { preferredTheme=localStorage.getItem(themeKey); } catch (_) {}
  function applyTheme(theme) {
    const dark=theme==='dark';document.documentElement.dataset.theme=theme;
    $('theme-toggle').setAttribute('aria-pressed',String(dark));
    $('theme-toggle').title=dark?'当前为暗色，切换到亮色主题':'当前为亮色，切换到暗色主题';
    $('theme-label').textContent=dark?'亮色主题':'暗色主题';
  }
  const validTheme=theme=>theme==='dark'||theme==='light';
  applyTheme(validTheme(preferredTheme)?preferredTheme:systemTheme.matches?'dark':'light');
  $('theme-toggle').onclick=()=>{
    preferredTheme=document.documentElement.dataset.theme==='dark'?'light':'dark';applyTheme(preferredTheme);
    try { localStorage.setItem(themeKey,preferredTheme); } catch (_) {}
  };
  systemTheme.addEventListener('change',event=>{if(!validTheme(preferredTheme))applyTheme(event.matches?'dark':'light');});
  window.addEventListener('storage',event=>{
    if(event.key===themeKey) { preferredTheme=event.newValue;applyTheme(validTheme(preferredTheme)?preferredTheme:systemTheme.matches?'dark':'light'); }
  });
  // 十二个停靠点。stage 对应后端实验步骤；id 是本页的站点。
  // store / verify 复用前一步的真实结果，只换观察角度，不重复调用模型。
  const STOPS = [
    { id:'parse', stage:'parse', label:'文档解析', tag:'本地', title:'01 文档解析', summary:'把文件变成带来源位置的文字。',
      why:'PDF、Word 只是容器，检索只认文字；但回答要能翻回原文，所以页码和章节必须在第一步就留下来，后面补不回来。',
      look:['sectionCount：一共切出几段文字','page：PDF 是物理页码，Word 是 null（分页由排版决定）','表格被拍平后长什么样'],
      try:'换 Word：表格会变成带 \\t 的文本行；换两页 PDF：page 从 1 开始。',
      pitfall:'把“解析成功”当成“可以提问了”。文字拿到了，能不能被检索到取决于后面的分块与入库。' },

    { id:'chunk', stage:'chunk', label:'分块', tag:'本地', title:'02 分块', summary:'把长文档切成能被问题命中的片段。',
      why:'模型上下文有限，检索也需要粒度。块太大混入无关内容，块太小会把“上海”“住宿”“650 元”拆散。',
      look:['chunkCount：片段数量随参数怎么变','characters：每段实际字符数，是否都接近设定值','sharedPrefixCharacters：可见重叠，通常小于配置值'],
      try:'把 220/40 改成 800/120，片段数从 6 变成 1；改成 120/20，片段更碎。',
      pitfall:'以为字符数等于 token 数。800 字符在中文里可能接近 800 token，在英文里只有 200 左右。' },

    { id:'embed', stage:'embed', label:'生成向量', tag:'模型', title:'03 生成向量', summary:'把每个片段编码成定长向量。',
      why:'向量让“意思相近”变成“距离相近”，这样按语义找资料才成立。它只负责定位，不存储知识。',
      look:['dimensions：实际维度必须等于配置','l2Norm：接近 1 说明向量已归一化','first8：每维都很小，单维没有可命名的含义'],
      try:'切换片段下拉框，比较同一份文档里不同段落的向量形状——它们看起来都差不多。',
      pitfall:'试图从某一维读出“城市”或“住宿”。分布式表示里没有任何一维对应业务概念。' },

    { id:'store', stage:'embed', label:'写入 Qdrant', tag:'查看', title:'04 写入 Qdrant', summary:'向量和原文一起落库，检索才有东西可查。',
      why:'“模型返回了向量”和“数据库里真的有这条记录”是两件事。这一步只看后者，避免把调用成功当成入库成功。',
      look:['pointsCount：实际写入条数，应等于片段数','collection：名字带配置签名，换模型就会换集合','id + payload：一条 point 同时挂向量和原文'],
      try:'回到上一步改分块参数再运行，观察 pointsCount 随片段数变化。',
      pitfall:'只改 RAG_EMBEDDING_DIMENSIONS 就以为换好了模型。维度不一致会直接失败，而不是自动压缩。' },

    { id:'recall-keyword', stage:'retrieve', mode:'keyword', label:'关键词召回', tag:'检索', title:'05 关键词召回（BM25）', summary:'按字面找：词频、逆文档频率、长度归一化。',
      why:'编号、型号、政策术语这类“必须字面命中”的查询，关键词比向量可靠。它也是 Embedding 不可用时的兜底。',
      look:['keywordHits：命中条数与每条的 BM25 分数','分数没有固定区间，不能当概率','没有词命中时返回空，不会用零分文档凑数'],
      try:'把问题改成“上海酒店”，再改成生造词“火星基地津贴”，观察关键词路直接返回空。',
      pitfall:'拿 BM25 的 1.98 和余弦的 0.57 比较大小。两者量纲不同，不能相加也不能互相解释。' },

    { id:'recall-vector', stage:'retrieve', mode:'vector', label:'向量召回', tag:'模型', title:'06 向量召回（Cosine）', summary:'按意思找：同义改写、跨语言也能命中。',
      why:'用户不会用文档里的原词提问。“酒店”和“住宿”字面不同，语义上是一回事，只有向量能接住。',
      look:['vectorHits：每条的余弦分数','cosineChecks：页面复算值应与数据库返回值一致','阈值：调高只会砍掉这一路'],
      try:'把阈值拉到 0.99，观察向量路清空、关键词路不受影响。',
      pitfall:'认为“召回到了就是有答案”。向量检索永远返回最近邻，哪怕它离问题很远。' },

    { id:'recall-hybrid', stage:'retrieve', mode:'hybrid', label:'双路并列', tag:'检索', title:'07 双路并列', summary:'同一问题，两路各自排序，先别急着合并。',
      why:'看清两路的分歧，才知道后面为什么要融合：同一片段可能一路第一、另一路第四，也可能只有一路命中。',
      look:['两列的 #1 是不是同一个片段','同一片段在两路的名次差多少','有没有一路完全没命中的片段'],
      try:'用“去上海出差，酒店每晚最高能报销多少钱？”跑一次，记下两路各自的第一名。',
      pitfall:'以为混合检索一定比单路强。语料很小时两路结果高度重合，融合只改变顺序。' },

    { id:'fusion', stage:'fusion', label:'RRF 融合', tag:'本地', title:'08 RRF 融合', summary:'用名次而不是分数，把两份榜单合成一份。',
      why:'BM25 和余弦量纲不同，直接相加没有意义。RRF 只问“它在两路里各排第几”，从而绕开标定问题。',
      look:['每条的 keywordRank / vectorRank 与两项贡献','fusedScore 是否等于两项之和','双路都靠前的片段是否反超单路第一'],
      try:'手算一行的 1/(60+名次) 之和，与页面数字对照。',
      pitfall:'把融合第一名当成“能回答问题的证据”。RRF 奖励一致性，不判断内容对错。' },

    { id:'rerank', stage:'rerank', label:'重排', tag:'模型', title:'09 重排', summary:'对候选逐一判断“能不能回答这个问题”。',
      why:'召回只保证“有点像”。重排把问题和候选放在一起读，把真正能回答的那条顶上来——这是唯一能纠正融合错位的环节。',
      look:['beforeRank → afterRank：谁上来了、谁掉下去','beforeScore 与 rerankScore：两种分数不能比较','scoreType：原始分可大于 1，也可能没有分数'],
      try:'选“独立候选集”，对比上海办公室餐饮 80、北京住宿 550、上海住宿 650 三条。',
      pitfall:'把“排序变了”当成“质量提升了”。有时它只是把两条无关片段互相调换。' },

    { id:'prompt', stage:'prompt', label:'组装 Prompt', tag:'本地', title:'10 组装 Prompt', summary:'规则、问题、编号证据，分区放进消息。',
      why:'模型看不到数据库。它只知道这一次请求里给了什么，所以证据必须有编号、有来源，且与系统规则分开。',
      look:['messages：system 规则与 user 证据是两条消息','citation 编号：从 1 开始，重排后会重排','characters：证据条数直接影响输入长度与成本'],
      try:'把证据数量从 3 改成 6，比较字符数翻了多少。',
      pitfall:'把历史对话当成事实依据。历史只帮助理解问题，不是证据。' },

    { id:'generate', stage:'generate', label:'生成回答', tag:'模型', title:'11 生成回答', summary:'真实调用模型，按证据作答并标注引用。',
      why:'前九步都在准备输入。这里第一次产生给人看的文字，也是最容易被“通顺”骗过去的一步。',
      look:['answer：数字、城市、费用类别是否对得上','citations：回答里的 [n] 指向哪条证据','citationNumbersValid：编号是否落在本轮范围'],
      try:'问“公司 CEO 的手机号”，观察它是否明确说资料里没有。',
      pitfall:'看到有 [1] 就认为有依据。编号合法只说明它存在，不说明它支持这句话。' },

    { id:'verify', stage:'generate', view:'verify', label:'验收回答', tag:'查看', title:'12 验收回答', summary:'把回答拆成“程序能查的”和“只能人查的”。',
      why:'引用校验能自动做，事实核对不能。把两者分开，才知道上线后哪些错误会被系统拦住、哪些只能靠人。',
      look:['每个 [n] 是否落在证据范围内','回答里的数字是否真的出现在被引用的证据中','系统能给结论 vs 必须人工核对的清单'],
      try:'换一个问题再验收，观察“数字找不到出处”的提示如何出现。',
      pitfall:'把 citationNumbersValid=true 当成“事实已验证”。本项目的 factsVerified 始终是 false。' }
  ];
  const STAGE_ORDER = ['parse','chunk','embed','retrieve','fusion','rerank','prompt','generate'];
  const currentStop = () => STOPS[state.index];
  const currentStage = () => STOPS[state.index].stage;
  const state = { index:0, run:null, results:{}, busy:false, runningStage:null, config:null,
    settings:{size:220,overlap:40,query:'去上海出差，酒店每晚最高能报销多少钱？',topK:5,threshold:0,recallMode:'hybrid',fusionTopK:10,method:'configured',rerankSource:'fused',promptSource:'ranked',evidenceCount:3} };
  const node = (tag,cls,text) => { const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n; };
  async function api(path,body,method='POST',base='/api/v1/tutorial') {
    let token='';try { token=sessionStorage.getItem('zhixu.rag.accessToken') || ''; } catch (_) {}
    const headers=token ? {Authorization:'Bearer '+token} : {};
    if(body!==undefined && !(body instanceof FormData)) headers['Content-Type']='application/json';
    const response=await fetch(base+path,{method,headers,credentials:'same-origin',body:body===undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),signal:AbortSignal.timeout(180000)});
    const data=await response.json();if(!response.ok)throw new Error(data.detail || '请求失败：HTTP '+response.status);return data;
  }
  function error(message) { $('error').textContent=message || ''; $('error').hidden=!message; }
  function field(label,key,type='text',options) {
    const wrap=node('label','field');wrap.append(node('span','',label));let input;
    if(options) { input=node('select');for(const [value,text] of options){const option=node('option','',text);option.value=value;input.append(option);} }
    else { input=node('input');input.type=type;if(type==='number')input.step=key==='threshold' ? '.05' : '1'; }
    input.id='setting-'+key;input.value=state.settings[key];
    const update=()=>{state.settings[key]=type==='number'?Number(input.value):input.value;if(key==='recallMode')renderFlow();};
    input.addEventListener('input',update);input.addEventListener('change',update);wrap.append(input);return wrap;
  }
  // The diagram navigates the same eight real experiments; selection alone never calls an API.
  function selectStage(index,scroll=false) {
    if(state.busy)return;
    const target=STOPS[index];if(!target)return;
    state.index=index;
    if(target.mode)state.settings.recallMode=target.mode;
    error();render();
    if(scroll)$('lesson').scrollIntoView({behavior:'smooth',block:'start'});
  }
  // 全景图上的节点映射到停靠点：qdrant→写入、answer→验收、两路召回→各自的站。
  function stopIndexForMap(item){
    const focus=item.dataset.focus,branch=item.dataset.branch,stage=item.dataset.stage;
    if(focus==='qdrant')return STOPS.findIndex(s=>s.id==='store');
    if(focus==='verify')return STOPS.findIndex(s=>s.id==='verify');
    if(branch)return STOPS.findIndex(s=>s.id==='recall-'+branch);
    return STOPS.findIndex(s=>s.id===stage);
  }
  function renderFlow() {
    const hybrid=currentStop().id==='recall-hybrid';
    document.querySelectorAll('.map-action').forEach(item=>{
      const index=stopIndexForMap(item);
      const active=hybrid ? (item.dataset.branch==='keyword'||item.dataset.branch==='vector') : index===state.index;
      const stage=item.dataset.stage;
      const completed=Boolean(state.results[stage]);
      item.classList.toggle('is-active',active);
      item.classList.toggle('is-working',Boolean(state.runningStage)&&stage===state.runningStage);
      item.classList.toggle('is-done',completed);
      item.setAttribute('aria-pressed',String(active));
      item.setAttribute('aria-disabled',String(state.busy));
      item.setAttribute('tabindex',state.busy?'-1':'0');
    });
    document.querySelectorAll('.map-wires path[data-stage]').forEach(path=>{
      path.classList.toggle('is-active',path.dataset.stage===currentStage());
      path.classList.toggle('is-working',path.dataset.stage===state.runningStage);
    });
    $('flow-progress').textContent='第 '+String(state.index+1).padStart(2,'0')+' / '+STOPS.length+' 站';
    $('flow-prev').disabled=state.busy||state.index===0;
    $('flow-next').disabled=state.busy||state.index===STOPS.length-1;
  }
  function firstStopIndexOfStage(stage){const i=STOPS.findIndex(s=>s.stage===stage);return i<0?'—':String(i+1).padStart(2,'0');}
  function render() {
    const s=currentStop(),stage=s.stage;
    $('steps').replaceChildren();STOPS.forEach((item,i)=>{
      const button=node('button','step'+(state.index===i?' active':'')+(state.results[item.stage]?' done':''));
      button.append(node('span','num',String(i+1).padStart(2,'0')),node('strong','',item.label),node('span','',item.tag));
      button.disabled=state.busy;button.setAttribute('aria-current',state.index===i?'step':'false');
      button.title=item.title+'：'+item.summary;button.onclick=()=>selectStage(i);$('steps').append(button);
    });
    $('lesson-number').textContent='第 '+String(state.index+1).padStart(2,'0')+' / '+STOPS.length+' 站 · '+s.tag;
    $('lesson-title').textContent=s.title;
    $('lesson-summary').textContent=s.summary;
    $('principle').textContent=s.why;
    const look=$('look-list');look.replaceChildren();s.look.forEach(text=>look.append(node('li','',text)));
    $('experiment-tip').textContent=s.try;
    $('pitfall').textContent=s.pitfall;
    $('controls').replaceChildren();const c=$('controls');
    if(s.view){
      const needs=s.view==='store'?'embed':'generate';
      const ready=Boolean(state.results[needs]);
      c.append(node('p','muted','这一站不产生新数据：它把第 '+firstStopIndexOfStage(needs)+' 站的实际结果换一个角度重排，便于当场核对。'));
      $('execute').disabled=true;
      $('execute').textContent=ready?'本步复用已生成的数据':'先完成第 '+firstStopIndexOfStage(needs)+' 站';
      $('execution-hint').textContent='不调用模型、不写数据库。';
    } else {
      if(stage==='chunk'){c.append(field('分块长度（字符）','size','number'),field('重叠长度（字符）','overlap','number'));}
      if(stage==='retrieve'){c.append(field('召回模式','recallMode','text',[['hybrid','双路召回'],['keyword','关键词 BM25 · 可离线'],['vector','向量 Cosine']]),field('问题','query'),field('Top-K','topK','number'),field('Cosine 阈值 [-1, 1]','threshold','number'));}
      if(stage==='fusion'){c.append(field('问题','query'),field('融合后保留数量','fusionTopK','number'));}
      if(stage==='rerank'){c.append(field('问题','query'),field('候选来源','rerankSource','text',[['fused','融合后的候选'],['retrieved','单路召回对照（双路模式取向量）'],['fixture','独立候选集（无需入库）']]),field('重排方式','method','text',[['llm','真实 LLM 重排 · DeepSeek'],['bm25','离线 BM25 对照 · 非神经网络'],['configured','使用生产重排配置']]));}
      if(stage==='prompt'){c.append(field('问题','query'),field('证据来源','promptSource','text',[['ranked','重排后的候选'],['fused','融合后的候选'],['retrieved','向量召回的候选'],['fixture','独立证据集（无需模型）']]),field('证据数量','evidenceCount','number'));}
      $('execute').disabled=state.busy || !state.config;
      $('execute').textContent=state.busy?'实验运行中…':'运行当前实验 →';
      $('execution-hint').textContent=['embed','retrieve','generate'].includes(stage)?'本步调用真实云端模型 API；请等待结果。':'每一步都有独立入口，前置步骤不足时会给出提示。';
    }
    renderInput(s.view==='store'?'embed':s.view==='verify'?'generate':stage);
    for(const id of ['prepare','clear','run-all','upload','sample']) $(id).disabled=state.busy || (id==='clear'&&!state.run);
    for(const input of c.querySelectorAll('input,select'))input.disabled=state.busy;
    $('run-status').textContent=state.run?'实验 '+state.run.runId.slice(0,8)+' · 独立索引':'尚未创建实验';
    $('export-all').disabled=!Object.keys(state.results).length || state.busy;
    renderFlow();renderOutput(s);document.body.classList.toggle('busy',state.busy);
  }
  function renderInput(stage) {
    const box=$('input-preview');box.replaceChildren();
    const result=state.results[stage],input=result?.input;
    const sourceLabel=node('p','data-provenance',result?'本次已完成实验的实际输入':'待运行输入 · 由前置步骤提供');box.append(sourceLabel);
    if(stage==='parse') {box.append(piece('源文件',input?.filename||state.run?.filename||'请先准备示例或上传文件'));if(state.run?.sourcePreview)box.append(piece('文件文本预览',state.run.sourcePreview));return;}
    if(stage==='chunk') {const sections=input?.sections||state.results.parse?.output.sections; if(sections?.length){sections.forEach((section,i)=>box.append(piece('原文 '+(i+1)+' · '+location(section),section.text)));return;}}
    if(stage==='embed') {const texts=input?.texts||state.results.chunk?.output.chunks.map(x=>x.chunk.text);if(texts?.length){box.append(node('p','muted',texts.length+' 个片段逐条编码；每个片段对应一个向量及一条数据库记录。'));texts.forEach((text,i)=>{const details=node('details','input-chunk');details.open=i===0;details.append(node('summary','','CHUNK '+i+' · '+text.length+' 字符'),node('p','full-text',text));box.append(details);});return;}}
    if(stage==='retrieve') {box.append(piece('用户问题',input?.query||state.settings.query));box.append(piece('检索范围',state.results.chunk?state.results.chunk.output.chunkCount+' 个片段；关键词与向量分别召回候选。':'尚无片段，请先解析、分块，并按需要完成向量入库。'));return;}
    if(stage==='fusion') {const source=input||state.results.retrieve?.output;if(source){for(const [key,label] of [['keywordHits','关键词 BM25'],['vectorHits','向量 Cosine']]){box.append(node('h3','',label));(source[key]||[]).forEach((hit,i)=>box.append(piece('#'+(i+1)+' · '+hit.id.slice(0,8),hit.text,'分数 '+hit.score.toPrecision(6))));}return;}}
    if(stage==='rerank') {box.append(piece('问题',input?.query||state.settings.query));const hits=input?.candidates||(state.settings.rerankSource==='fused'?state.results.fusion?.output.hits:state.settings.rerankSource==='retrieved'?state.results.retrieve?.output.hits:null);if(hits){hits.forEach((hit,i)=>box.append(piece('输入排名 '+(i+1)+' · '+hit.id.slice(0,8),hit.text,'分数 '+hit.score.toPrecision(6))));return;}}
    if(stage==='prompt') {box.append(piece('问题',input?.question||state.settings.query));const hits=result?.output.citations||(state.settings.promptSource==='ranked'?state.results.rerank?.output.hits:state.settings.promptSource==='fused'?state.results.fusion?.output.hits:null);if(hits){hits.slice(0,input?.topK||state.settings.evidenceCount).forEach((hit,i)=>box.append(piece('证据 ['+(i+1)+'] · '+location(hit),hit.text)));return;}}
    if(stage==='generate'&&state.results.prompt){state.results.prompt.output.messages.forEach(m=>box.append(piece(m.role.toUpperCase(),m.content)));return;}
    box.append(node('p','muted','前置数据尚未生成；请先运行前面的步骤。独立候选集在执行后显示实际输入。'));
  }
  function metricRow(values) { const row=node('div','metric-row');values.forEach(([label,value])=>{const item=node('div','metric');item.append(node('b','',String(value)),node('span','',label));row.append(item);});return row; }
  function piece(title,text,extra) { const card=node('div','piece');const head=node('div','piece-header');head.append(node('span','',title));if(extra)head.append(node('span','',extra));card.append(head,node('p','',text));return card; }
  function location(hit) { return hit.page?'第 '+hit.page+' 页':hit.section || '正文'; }
  function vectorChart(values) {
    const ns='http://www.w3.org/2000/svg';
    const make=(tag,attrs,text)=>{const el=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));if(text!==undefined)el.textContent=text;return el;};
    const svg=make('svg',{viewBox:'0 0 560 210',class:'embedding-chart',role:'img','aria-label':'实际向量前八维：中线为零，上方为正数，下方为负数。'});
    const scale=Math.max(...values.map(Math.abs),0.000001);
    svg.append(make('line',{x1:20,y1:95,x2:550,y2:95,class:'vector-zero'}),make('text',{x:8,y:98,class:'vector-axis'},'0'));
    values.forEach((value,i)=>{
      const x=30+i*65,height=Math.abs(value)/scale*66;
      svg.append(make('rect',{x,y:value>=0?95-height:95,width:37,height:Math.max(.5,height),rx:3,class:value>=0?'vector-positive':'vector-negative'}),
        make('text',{x:x+18.5,y:180,'text-anchor':'middle',class:'vector-axis'},'d'+(i+1)),
        make('text',{x:x+18.5,y:199,'text-anchor':'middle',class:'vector-value'},value.toFixed(4)));
    });
    return svg;
  }
  function renderEmbedding(out,result) {
    const data=result.output;
    out.append(metricRow([['每个向量的维度',data.database.dimensions],['已写入的记录',data.database.pointsCount]]));
    const picker=node('label','field');picker.append(node('span','','选择一个片段，跟踪它的文本 → 向量 → 数据库记录'));
    const select=node('select');select.id='embedding-chunk';
    data.vectors.forEach((item,i)=>{const option=node('option','','CHUNK '+item.chunkIndex+' · '+item.chunkId.slice(0,8));option.value=i;select.append(option);});picker.append(select);out.append(picker);
    const example=node('div','embedding-example');out.append(example);
    const show=()=>{
      example.replaceChildren();const item=data.vectors[Number(select.value)||0];if(!item)return;
      const text=result.input.texts[item.chunkIndex];
      example.append(piece('① 原始文本 · CHUNK '+item.chunkIndex,text));
      const chart=node('section','vector-explainer');chart.append(node('h3','','② 同一文本编码成一个向量'),vectorChart(item.vector.first8));
      chart.append(node('p','muted','前 8 / '+item.vector.dimensions+' 维 · 柱高相对本组最大绝对值缩放；中线是 0，紫色为正、蓝色为负。单个维度不对应可直接解释的业务含义。'));
      const cells=node('div','vector-values');item.vector.first8.forEach((value,i)=>cells.append(node('code','','d'+(i+1)+' = '+value.toPrecision(7))));chart.append(cells);
      chart.append(node('p','muted','这里只展示前 8 维，实际入库 '+item.vector.dimensions+' 维。L2 范数 '+item.vector.l2Norm.toFixed(6)+'。'));example.append(chart);
      const point=node('section','qdrant-record');point.id='qdrant-record';
      point.append(node('h3','','③ 写入 Qdrant：一条 point 同时关联向量和原文'),node('p','muted','本次实际写入记录 · Collection: '+data.database.collection));
      point.append(piece('id · 该片段的唯一标识',item.chunkId));
      const row=node('div','point-fields');
      const vector=piece('vector · 用来计算语义相似度','['+item.vector.first8.map(v=>v.toPrecision(7)).join(', ')+', …]');vector.append(node('p','muted','实际 '+item.vector.dimensions+' 维；省略其余维度，仅用于展示。'));
      const payload=piece('payload · 保留片段归属和原文','documentId: '+data.payloadExample.documentId+'\n\ntext:\n'+text);
      row.append(vector,payload);point.append(row,node('p','point-explanation','检索先通过 vector 找到相近的 point，再用同一条记录的 id / payload 对应原文。向量不会替代原文。'));example.append(point);
    };
    select.onchange=show;show();
  }
  function renderRecall(out,result,mode,stage){
    const data=result.output;
    const ran=result.input.mode||'hybrid';
    if(ran!==mode){
      out.append(node('p','mismatch-note','当前显示的是上一次 '+ran+' 模式的结果；点“运行当前实验”用 '+mode+' 模式重跑，才会得到这一站的真实数据。'));
    }
    out.append(metricRow([['关键词命中',data.keywordHits.length],['向量命中',data.vectorHits.length],['问题向量维度',data.queryVector.dimensions||'未调用']]));
    const branches=node('div','recall-branches');
    const columns=[['keyword','关键词 · BM25',data.keywordHits,'BM25'],['vector','语义 · 向量',data.vectorHits,'Cosine']];
    for(const [key,title,hits,kind] of columns){
      if(mode!=='hybrid' && mode!==key)continue;
      const column=node('section');column.append(node('h3','',title));
      if(!hits.length)column.append(node('p','muted',key==='keyword'?'没有词项命中：关键词路不会用零分文档补足 Top-K。':'本路未启用，或所有候选都低于当前阈值。'));
      hits.forEach((hit,i)=>{const card=piece('#'+(i+1)+' · '+hit.id.slice(0,8)+' · '+location(hit),hit.text,kind+' '+hit.score.toFixed(6));
        if(kind==='Cosine'&&data.cosineChecks?.[i])card.append(node('p','muted','页面复算值 '+data.cosineChecks[i].recomputedCosine.toFixed(7)+'，用于确认分数确实是余弦。'));
        column.append(card);});
      branches.append(column);
    }
    out.append(branches);
  }
  function renderStore(out,result){
    const data=result.output,first=data.vectors[0];
    out.append(metricRow([['实际写入',data.database.pointsCount+' 条'],['维度',data.database.dimensions],['集合',data.database.collection]]));
    out.append(node('p','muted','下面这条记录就是数据库里的一个 point：id 用来去重与引用，vector 用来算相似度，payload 保存归属和原文。'));
    if(!first){out.append(node('p','muted','本次没有写入任何记录。'));return;}
    const card=node('section','qdrant-record');
    card.append(node('h3','','一条真实写入记录'),piece('id · 片段的稳定标识',first.chunkId));
    const row=node('div','point-fields');
    row.append(piece('vector · 前 8 维预览','['+first.vector.first8.map(v=>v.toPrecision(7)).join(', ')+', …]'));
    row.append(piece('payload.text · 可回溯的原文',result.input.texts[first.chunkIndex]));
    card.append(row);
    card.append(node('p','point-explanation','写入条数应当等于片段数。若少了，说明批量写入中断；若多了，说明旧向量没有按 documentId 清掉。'));
    out.append(card);
  }
  function renderVerify(out,result){
    const data=result.output;
    const answer=data.answer||'';
    const evidence=data.citations||[];
    out.append(metricRow([['引用编号校验',data.citationNumbersValid?'通过':'未通过'],['引用条数',evidence.length],['事实核验','未自动执行']]));
    out.append(node('div','answer',answer));
    const cited=[...new Set((answer.match(/\[(\d+)]/g)||[]).map(token=>Number(token.slice(1,-1))))].sort((a,b)=>a-b);
    const checks=node('section','verify-block');
    checks.append(node('h3','','① 程序能查：引用编号是否落在本轮证据范围内'));
    if(!cited.length)checks.append(node('p','warn-line','回答里没有任何 [n] 引用，无法定位依据。'));
    cited.forEach(number=>{
      const hit=evidence[number-1],ok=Boolean(hit);
      checks.append(node('p',ok?'check-ok':'check-bad',(ok?'✓ ':'✗ ')+'['+number+'] '+(ok?'→ '+hit.filename+' · '+location(hit)+' · '+hit.text.slice(0,60).replace(/\s+/g,' ')+'…':'越界：本轮只有 '+evidence.length+' 条证据')));
    });
    const citedEvidence=cited.map(number=>evidence[number-1]).filter(Boolean);
    const numbers=[...new Set((answer.match(/\d+(?:\.\d+)?/g)||[]))];
    checks.append(node('h3','','② 半自动：回答里的数字能否在“被引用的证据”里找到'));
    if(!numbers.length)checks.append(node('p','muted','回答里没有出现数字，这一步检查不适用。'));
    numbers.forEach(value=>{
      const where=citedEvidence.filter(hit=>hit.text.includes(value)).map(hit=>hit.filename+' · '+location(hit));
      checks.append(node('p',where.length?'check-ok':'check-bad',(where.length?'✓ ':'✗ ')+'“'+value+'” '+(where.length?'出现在 '+where.join('、'):'在被引用的证据原文中找不到出处')));
    });
    checks.append(node('p','muted','数字出现只说明文本重合，不说明它被正确使用（例如把“上限”读成“定额”仍会通过）。'));
    checks.append(node('h3','','③ 只能人查：把回答逐句对回原文'));
    ['城市与费用类别是否对应','“最高上限”是否被当成了定额','单位是每人每晚还是每人','条件与例外是否被省略'].forEach(text=>checks.append(node('p','check-manual','？ '+text)));
    out.append(checks);
    out.append(node('p','muted','无论上面自动检查是否通过，本项目的 factsVerified 始终为 false：事实正确性需要评测集与人工确认。'));
  }
  function renderOutput(s) {
    const stage=s.stage;
    const result=state.results[stage],out=$('output');out.replaceChildren();$('output-meta').textContent='';$('export-stage').disabled=!result;
    $('raw-json').textContent=result?JSON.stringify(result,null,2):'尚无结果';
    if(!result){
      const empty=s.view==='store'?'先完成第 03 站“生成向量”，这里会显示实际写入 Qdrant 的记录。':s.view==='verify'?'先完成第 11 站“生成回答”，这里会把引用逐条拆开核对。':'运行这一步后，这里展示实际输出。完整文本不会截断。';
      out.append(node('div','empty',empty));return;
    }
    $('output-meta').textContent=result.elapsedMs+' ms · '+result.mode;const data=result.output;
    if(s.view==='store')renderStore(out,result);
    else if(s.view==='verify')renderVerify(out,result);
    else if(s.id.startsWith('recall-'))renderRecall(out,result,s.mode||'hybrid',stage);
    else {
      if(stage==='parse'){out.append(metricRow([['来源段落',data.sectionCount],['提取字符',data.characters]]));data.sections.forEach((s,i)=>out.append(piece('SECTION '+(i+1)+' · '+location(s),s.text)));}
      if(stage==='chunk'){out.append(metricRow([['片段数量',data.chunkCount],['分块长度',result.input.size],['重叠参数',result.input.overlap]]));out.append(node('p','overlap-legend','下方每张卡片展示一个完整片段。高亮部分是与前一片段重复的前缀，用来保留边界上下文。'));data.chunks.forEach(({chunk,characters,sharedPrefixCharacters})=>{
        const card=piece('CHUNK '+chunk.index+' · '+location(chunk),'',characters+' 字符 · 重叠 '+sharedPrefixCharacters+' 字符');const p=card.querySelector('p');
        if(sharedPrefixCharacters)p.append(node('mark','',chunk.text.slice(0,sharedPrefixCharacters)));p.append(document.createTextNode(chunk.text.slice(sharedPrefixCharacters)));out.append(card);
      });}
      if(stage==='embed')renderEmbedding(out,result);
      if(stage==='retrieve')renderRecall(out,result,result.input.mode||'hybrid',stage);
      if(stage==='fusion'){
        out.append(metricRow([['去重后候选',data.candidateCount],['保留候选',data.selectedCount],['RRF 常数',data.rankConstant]]));
        out.append(node('p','muted','RRF = 关键词贡献 + 向量贡献；每路贡献 = 1 / (60 + 名次)，缺席为 0。'));
        const wrap=node('div','score-table-wrap'),table=node('table','score-table'),head=node('tr');
        ['片段 ID','关键词名次','向量名次','关键词贡献','向量贡献','RRF'].forEach(label=>head.append(node('th','',label)));table.append(head);
        data.contributions.forEach(row=>{const tr=node('tr');[row.hit.id.slice(0,8),row.keywordRank??'—',row.vectorRank??'—',row.keywordContribution.toFixed(8),row.vectorContribution.toFixed(8),row.fusedScore.toFixed(8)].forEach(value=>tr.append(node('td','',String(value))));table.append(tr);});
        wrap.append(table);out.append(wrap);
        data.hits.forEach((hit,i)=>out.append(piece('#'+(i+1)+' · '+hit.id.slice(0,8)+' · '+location(hit),hit.text,'RRF '+hit.score.toFixed(8))));
      }
      if(stage==='rerank'){
        out.append(metricRow([['候选数量',data.hits.length],['模型',data.model],['分数类型',data.scoreType]]));
        out.append(node('p','muted',data.scoreType==='ORDER_ONLY'?'LLM 只输出顺序，没有数值重排分数。':data.scoreType==='RAW_RELEVANCE'?'智谱原始相关性分数，可大于 1 或小于 0；不是概率，与输入 RRF 分数不是同一量纲。':'模型相关性 / BM25 分数，不是答案正确概率。'));
        data.comparison.forEach(row=>{
          const card=piece('原第 '+row.beforeRank+' → 新第 '+row.afterRank+' · '+row.hit.id.slice(0,8),row.hit.text);
          card.append(node('p','score-detail','输入 '+data.inputScoreType+'：'+row.beforeScore.toPrecision(9)+'  |  重排 '+data.scoreType+'：'+(row.rerankScore===null?'不提供':row.rerankScore.toPrecision(9))));out.append(card);
        });
      }
      if(stage==='prompt'){out.append(metricRow([['使用证据',data.selectedCount],['消息字符数',data.characters]]));data.messages.forEach(m=>{const card=piece(m.role.toUpperCase(),'');card.querySelector('p').className='prompt-message';card.querySelector('p').textContent=m.content;out.append(card);});}
      if(stage==='generate'){out.append(node('div','answer',data.answer));out.append(node('p','muted',data.citationNumbersValid?'引用编号可对应本轮证据；事实仍需核对。':'回答没有有效引用编号，请核对原文。'));data.citations.forEach((hit,i)=>out.append(piece('['+(i+1)+'] '+hit.filename+' · '+location(hit),hit.text)));}
    }
    const notes=node('div','notes');result.notes.forEach(text=>notes.append(node('p','',text)));out.append(notes);
  }
  async function prepare(sample,upload) {
    if(state.run)await api('/runs/'+state.run.runId,undefined,'DELETE');
    state.run=null;state.results={};state.index=0;
    state.run=upload?await api('/runs/upload',upload):await api('/runs',{sample});
  }
  async function execute(stage) {
    if(!state.run){const selected=state.index;await prepare($('sample').value);state.index=selected;}
    const s=state.settings;let body={};
    if(stage==='chunk')body={size:s.size,overlap:s.overlap};
    if(stage==='retrieve')body={query:s.query,topK:s.topK,threshold:s.threshold,mode:s.recallMode};
    if(stage==='fusion')body={query:s.query,topK:s.fusionTopK};
    if(stage==='rerank')body={query:s.query,method:s.method,source:s.rerankSource};
    if(stage==='prompt')body={question:s.query,topK:s.evidenceCount,source:s.promptSource};
    state.runningStage=stage;render();
    let result;try { result=await api('/runs/'+state.run.runId+'/'+stage,body); } finally { state.runningStage=null; }
    const position=STAGE_ORDER.indexOf(stage);
    // 上游重跑会让下游数据失效；按阶段顺序清空，避免页面显示过期结果。
    for(let i=position+1;i<STAGE_ORDER.length;i++)delete state.results[STAGE_ORDER[i]];
    state.results[stage]=result;return result;
  }
  async function busy(action) {if(state.busy)return;state.busy=true;error();render();try{await action();}catch(e){error(e.name==='TimeoutError'?'等待超时，请查询实验状态后再操作。':e.message);}finally{state.busy=false;render();}}
  function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}));const a=node('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  document.querySelectorAll('.map-action').forEach(item=>{
    const choose=()=>{const index=stopIndexForMap(item);if(index>=0&&!state.busy){selectStage(index);if(item.dataset.focus==='qdrant')document.getElementById('output')?.scrollIntoView({behavior:'smooth',block:'nearest'});}};
    item.addEventListener('click',choose);
    item.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose();}});
  });
  $('flow-prev').onclick=()=>selectStage(state.index-1);
  $('flow-next').onclick=()=>selectStage(state.index+1);
  $('execute').onclick=()=>busy(()=>execute(currentStage()));
  $('prepare').onclick=()=>busy(()=>prepare($('sample').value));
  $('upload').onchange=()=>{const file=$('upload').files[0];if(!file)return;const form=new FormData();form.append('file',file);$('upload').value='';busy(()=>prepare(null,form));};
  $('sample').onchange=()=>{$('download-sample').href='/api/v1/tutorial/samples/'+$('sample').value;};
  $('download-sample').onclick=event=>{event.preventDefault();busy(async()=>{let token='';try{token=sessionStorage.getItem('zhixu.rag.accessToken')||'';}catch(_){}const response=await fetch($('download-sample').href,{headers:token?{Authorization:'Bearer '+token}:{}});if(!response.ok)throw new Error('下载失败，请检查服务令牌');const url=URL.createObjectURL(await response.blob());const a=node('a');a.href=url;a.download='demo-handbook.'+$('sample').value;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});};
  $('clear').onclick=()=>busy(async()=>{await api('/runs/'+state.run.runId,undefined,'DELETE');state.run=null;state.results={};});
  $('run-all').onclick=()=>busy(async()=>{if(!state.run)await prepare($('sample').value);state.settings.recallMode='hybrid';state.settings.rerankSource='fused';state.settings.promptSource='ranked';for(const stage of STAGE_ORDER){const index=STOPS.findIndex(s=>s.stage===stage);if(index>=0){state.index=index;render();}await execute(stage);render();}state.index=STOPS.length-1;render();});
  $('export-stage').onclick=()=>download(state.results[currentStage()],'rag-'+currentStop().id+'.json');
  $('export-all').onclick=()=>download({run:state.run,stages:state.results},'rag-tutorial-'+state.run.runId+'.json');
  let corpus={items:[],questions:[]};
  function selectedDocument(){return corpus.items.find(item=>item.sha256===$('corpus-document').value);}
  function showDocument(){
    const item=selectedDocument();$('corpus-prepare').disabled=!item || item.status!=='READY';
    if(!item){$('corpus-detail').textContent='运行数据集下载和导入脚本后，这里会显示实际文件。';$('corpus-source').removeAttribute('href');return;}
    $('corpus-detail').textContent=item.pages+' 页 · '+item.status+' · '+item.chunkCount+' 个片段 · '+item.filename;
    try{const url=new URL(item.sourceUrl);if(['https:','http:'].includes(url.protocol))$('corpus-source').href=url.href;else $('corpus-source').removeAttribute('href');}catch(_){$('corpus-source').removeAttribute('href');}
    $('corpus-from').max=item.pages;$('corpus-to').max=item.pages;
  }
  function showCase(){
    const item=corpus.questions.find(item=>item.id===$('corpus-case').value);if(!item)return;
    $('corpus-question').value=item.query;
    $('corpus-case-note').textContent='核对依据：'+item.publisher+(item.negative?' · 资料不足，应拒绝编造答案。':' · 物理第 '+item.sourcePages.join('、')+' 页。');
    const doc=corpus.items.find(doc=>doc.filename===item.expected_document);
    if(doc){$('corpus-document').value=doc.sha256;$('corpus-from').value=item.sourcePages[0]||1;$('corpus-to').value=item.sourcePages[0]||1;showDocument();}
  }
  async function loadCorpus(){
    try{
      corpus=await api('/handbooks',undefined,'GET');$('corpus-status').textContent=corpus.downloaded+' 份手册已下载 · '+corpus.ready+' 份已完成入库 · '+corpus.chunks+' 个知识片段 · '+corpus.questions.length+' 个回归问题';
      $('corpus-document').replaceChildren();for(const item of corpus.items){const option=node('option','',item.title+' · '+item.pages+' 页 · '+item.status);option.value=item.sha256;$('corpus-document').append(option);}
      $('corpus-case').replaceChildren();for(const item of corpus.questions){const option=node('option','',item.id+' · '+item.query);option.value=item.id;$('corpus-case').append(option);}
      $('corpus-ask').disabled=!corpus.ready || !corpus.questions.length;showDocument();showCase();
      const report=corpus.evaluation;$('corpus-report').replaceChildren();
      if(report?.cases){$('corpus-report-title').textContent=(report.allPassed?'验收通过':'验收未通过')+' · 问答 '+report.passed+' / '+report.total+' · '+report.finishedAt;
        for(const item of report.cases){const card=piece((item.passed?'通过':'未通过')+' · '+item.id,item.query+'\n'+(item.answer||item.error||''));card.append(node('p','muted','检索证据 '+(item.retrievalPassed?'✓':'✗')+' · 模型重排 '+(item.rerankPassed?'✓':'✗')+' · 答案事实 '+(item.answerPassed?'✓':'✗')+' · 引用证据 '+(item.citationPassed?'✓':'✗')));$('corpus-report').append(card);}
      }else{$('corpus-report-title').textContent='尚未生成自动回归报告';}
    }catch(e){$('corpus-status').textContent='数据集目录暂不可用：'+e.message;}
  }
  $('corpus-refresh').onclick=loadCorpus;$('corpus-document').onchange=showDocument;$('corpus-case').onchange=showCase;
  $('corpus-prepare').onclick=()=>busy(async()=>{
    const item=selectedDocument();if(!item)throw new Error('请先选择已入库的手册');
    if(state.run)await api('/runs/'+state.run.runId,undefined,'DELETE');state.run=null;state.results={};
    state.run=await api('/runs/from-document',{documentId:item.documentId,fromPage:Number($('corpus-from').value),toPage:Number($('corpus-to').value)});
    state.settings.size=800;state.settings.overlap=120;state.settings.query=$('corpus-question').value.trim()||'请总结本页主要的员工政策。';state.index=0;
    $('lesson-title').scrollIntoView({behavior:'smooth',block:'start'});
  });
  $('corpus-ask').onclick=async()=>{
    if($('corpus-ask').disabled)return;const question=$('corpus-question').value.trim();if(!question)return;
    $('corpus-ask').disabled=true;$('corpus-answer').textContent='正在从完整知识库检索并生成答案…';
    try{const body={question,history:[]};if($('corpus-scope').value==='selected'){const doc=selectedDocument();if(!doc || doc.status!=='READY')throw new Error('所选手册尚未完成入库');body.documentId=doc.documentId;}
      const result=await api('/chat',body,'POST','/api/v1');$('corpus-answer').replaceChildren(node('p','',result.answer));
      result.citations.forEach((hit,i)=>$('corpus-answer').append(piece('['+(i+1)+'] '+hit.filename+' · '+location(hit),hit.text)));
    }catch(e){$('corpus-answer').textContent='请求失败：'+e.message;}finally{$('corpus-ask').disabled=false;}
  };
  loadCorpus();
  render();api('/config',undefined,'GET').then(config=>{state.config=config;$('service-status').textContent='教学服务已启用 · Embedding '+(config.embeddingConfigured?config.embeddingModel+' / '+config.embeddingDimensions+' 维':'未配置')+' · 聊天 '+(config.chatConfigured?config.chatModel:'未配置')+' · 生产重排 '+(config.rerankerConfigured?config.productionRerankMode:'未配置，可用真实 LLM 或离线对照');render();}).catch(e=>{$('service-status').textContent='教学接口未启用或无法访问。使用 Start-Local.ps1 启动，或设置 RAG_TUTORIAL_ENABLED=true。';error(e.message);});
})();
