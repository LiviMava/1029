const $=id=>document.getElementById(id);
const expected={123:['CONDITIONAL',7,'cn-standard-2026'],124:['OUTSIDE_WINDOW',7,'cn-standard-2026'],126:['INSUFFICIENT_EVIDENCE',0,null],129:['CONDITIONAL',5,'cn-standard-2025']};
let report;
$('token').value=sessionStorage.getItem('zhixu.rag.accessToken')||'';
async function api(path,method='POST',body){const r=await fetch('/api/v1/tutorial/orders'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json',Authorization:'Bearer '+$('token').value.trim()},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(180000)});const data=await r.json();if(!r.ok)throw Error(data.detail||data.message||r.status);return data;}
function show(title,value){const section=document.createElement('section');section.className='data';const h=document.createElement('h3');h.textContent=title;const pre=document.createElement('pre');pre.textContent=typeof value==='string'?value:JSON.stringify(value,null,2);section.append(h,pre);$('results').append(section);}
$('run').onclick=async()=>{
 $('run').disabled=true;$('case').disabled=true;$('download').disabled=true;$('review').hidden=true;$('results').replaceChildren();$('verdict').value='pending';$('notes').value='';
 const id=$('case').value,[status,days,policy]=expected[id];let run;
 report={order:id,expected:{status,days,policy},checkedAt:new Date().toISOString(),traces:{},checks:[],completed:false};
 try{
 run=await api('/runs','POST',{question:`我的订单 ${id} 现在能退货吗？如果可以，该怎么操作？`});report.runId=run.runId;
 for(const node of ['documents','prepare','question','sql','api','filter','keyword','vector','fusion','rerank','prompt','answer']){$('status').textContent='正在执行：'+node;report.traces[node]=await api(`/runs/${run.runId}/${node}`);}
 const t=report.traces,a=t.answer.output;
 const check=(name,passed)=>report.checks.push({name,passed});
 check('规则状态符合预期',a.eligibility.status===status);check('规则期限符合预期',a.eligibility.returnDays===days);
 const scope=t.filter.output.allowedDocumentIds;
 check('适用政策准确',policy?scope.length===1&&scope[0]===policy:scope.length===0);
 for(const stage of ['keyword','vector','rerank']){const hits=t[stage].output.hits;check(stage+' 候选范围与非空检查',policy?hits.length>0&&hits.every(h=>h.documentId===policy):hits.length===0);}
 check(policy?'引用编号有效（仅结构检查）':'无证据时未调用生成模型',policy?a.citationNumbersValid===true:a.generationMode==='NO_EVIDENCE_NO_MODEL_CALL');
 report.completed=true;show('自动检查',report.checks);show('实际回答',a.answer);show('模型收到的政策证据',t.prompt.output.evidence);
 $('review').hidden=false;$('status').textContent=`自动检查 ${report.checks.filter(c=>c.passed).length}/${report.checks.length} 通过；回答质量待人工复核。`;
 }catch(e){report.error=e.message;$('status').textContent='运行失败，不能计为通过：'+e.message;}
 finally{if(run){try{await api('/runs/'+run.runId,'DELETE');}catch(e){report.cleanupError=e.message;$('status').textContent+='；清理失败，实验将按服务过期机制清理。';}}$('run').disabled=false;$('case').disabled=false;$('download').disabled=false;}
};
$('download').onclick=()=>{report.humanReview={verdict:$('verdict').value,notes:$('notes').value};const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='rag-evaluation-'+report.order+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
