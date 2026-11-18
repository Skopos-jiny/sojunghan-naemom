/* ============================================================
   소중한 내몸 · 병원별 가벼운 댓글·대댓글 (후기와 별개)
   - 테이블: public.hospital_comments (2026-11-19 마이그레이션 hospital_comments, hospital_comments_no_links)
   - 쓰기: 약관 동의를 마친 일반 회원(병원 관계자 계정 불가) · 300자 · 대댓글 1단계
   - 서버 검사: 링크·전화번호 금지, 10분 10건, 1시간 내 같은 글 금지
   - 신고: reports(target_type='comment'), 서로 다른 3명 신고 시 자동 숨김 → 운영자 화면에서 복구/삭제
   - 화면: realView(실제 병원 상세)의 '의료진·인력 자세히 보기' 바로 위에 카드 삽입
   - 로드 순서: index.html에서 extra.js 등 기존 스크립트 '뒤'에 <script src="/comments.js?v=..."> 추가
   ============================================================ */
(function(){
if(typeof realView!=="function"||typeof route!=="function")return;

const E=s=>typeof esc==="function"?esc(s):String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const T=m=>typeof toast==="function"?toast(m):alert(m);
const sbq=()=>window.sb;
const MAX=300,PAGE=20,REPLY_FOLD=3;
const CM={};            // CM[hid] = {list:[], mine:Set, loaded, loading, shown, open:{}, replyTo, reportFor}
const st=hid=>CM[hid]||(CM[hid]={list:[],mine:new Set(),loaded:false,loading:false,shown:PAGE,open:{},replyTo:null,reportFor:null});
const mod=()=>typeof isMod==="function"&&isMod();
const prof=()=>typeof S!=="undefined"&&S.profile;

/* ---------- 스타일 ---------- */
const css=`.cm .cm-note{margin:0 0 10px}
.cm .cm-form{display:grid;gap:6px;margin-bottom:6px}
.cm textarea{width:100%;min-height:64px;resize:vertical;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:transparent;color:var(--ink);font:inherit;font-size:14.5px;line-height:1.5}
.cm textarea:focus{outline:2px solid var(--navy);outline-offset:1px}
.cm .cm-bar{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
.cm .cm-cnt{margin-right:auto;font-size:12px;color:var(--muted)}
.cm .cm-item{padding:12px 0;border-top:1px solid var(--line)}
.cm .cm-item:first-of-type{border-top:0}
.cm .cm-head{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:13px}
.cm .cm-head b{font-weight:700}
.cm .cm-time{color:var(--muted);font-size:12px}
.cm .cm-body{margin:4px 0 4px;white-space:pre-wrap;word-break:break-word;font-size:14.5px;line-height:1.55}
.cm .cm-body.del{color:var(--muted);font-style:italic}
.cm .cm-act{display:flex;gap:12px;font-size:12.5px}
.cm .cm-act button{background:none;border:0;padding:2px 0;color:var(--muted);cursor:pointer;font:inherit}
.cm .cm-act button:hover{color:var(--ink);text-decoration:underline}
.cm .cm-replies{margin:8px 0 0 14px;padding-left:12px;border-left:2px solid var(--line)}
.cm .cm-replies .cm-item{padding:8px 0;border-top:0}
.cm .cm-hidden{opacity:.55}
.cm .cm-rep{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px}
.cm .cm-rep select{padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--ink);font:inherit;font-size:13px}
.cm .cm-more{display:block;margin:10px auto 0}`;
const sEl=document.createElement("style");sEl.textContent=css;document.head.appendChild(sEl);

/* ---------- 유틸 ---------- */
function ago(t){const d=(Date.now()-new Date(t))/1000;
  if(d<60)return "방금";if(d<3600)return Math.floor(d/60)+"분 전";if(d<86400)return Math.floor(d/3600)+"시간 전";
  if(d<86400*7)return Math.floor(d/86400)+"일 전";const x=new Date(t);return `${String(x.getFullYear()).slice(2)}.${String(x.getMonth()+1).padStart(2,"0")}.${String(x.getDate()).padStart(2,"0")}`}
function errMsg(m){m=String(m||"");
  if(/no_links/.test(m))return "링크·전화번호·오픈채팅 주소는 댓글에 쓸 수 없어요.";
  if(/rate_limit/.test(m))return "댓글을 너무 빠르게 쓰고 있어요. 잠시 후 다시 시도해 주세요.";
  if(/duplicate_comment/.test(m))return "같은 내용의 댓글을 이미 남겼어요.";
  if(/reply_depth/.test(m))return "답글에는 다시 답글을 달 수 없어요.";
  if(/parent_not_found/.test(m))return "원 댓글이 삭제되었거나 숨겨졌어요.";
  if(/row-level security/i.test(m))return "로그인이 만료되었거나 필수 약관 동의가 필요해요. 다시 로그인해 주세요.";
  if(/reports_comment_once|duplicate key/.test(m))return "이미 신고한 댓글이에요.";
  if(/check constraint/.test(m))return "댓글은 1~300자로 써 주세요.";
  return "처리하지 못했어요. 잠시 후 다시 시도해 주세요.";}
function canWrite(){const p=prof();
  if(typeof S==="undefined"||!S.user)return {ok:false,why:"login"};
  if(!p)return {ok:false,why:"loading"};
  if(p.role==="moderator")return {ok:true};
  if(p.account_type==="hospital")return {ok:false,why:"hospital"};
  if(!(p.terms_agreed_at&&p.privacy_agreed_at&&p.over14_confirmed))return {ok:false,why:"consent"};
  return {ok:true};}

/* ---------- 데이터 ---------- */
async function load(hid,force){
  const s=st(hid);const sb=sbq();if(!sb||s.loading||(s.loaded&&!force))return;
  s.loading=true;
  try{
    const [a,b]=await Promise.all([
      sb.from("hospital_comments").select("id,parent_id,nickname,is_mod,body,status,created_at").eq("hospital_id",hid).order("created_at",{ascending:false}).limit(500),
      typeof S!=="undefined"&&S.user?sb.rpc("my_hospital_comment_ids",{p_hospital:hid}):Promise.resolve({data:[]})]);
    s.list=a.data||[];s.mine=new Set((b.data||[]).map(x=>typeof x==="string"?x:(x.my_hospital_comment_ids||x.id)));
    s.loaded=true;
  }finally{s.loading=false}
  paint(hid);
}
function tree(hid){const s=st(hid);const top=[],rep={};
  for(const c of s.list){if(c.parent_id)(rep[c.parent_id]=rep[c.parent_id]||[]).push(c);else top.push(c)}
  for(const k in rep)rep[k].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  // 삭제된 원댓글은 남은 답글이 있을 때만 자리표시
  const vis=top.filter(c=>c.status!=="deleted"||(rep[c.id]||[]).some(r=>r.status!=="deleted"));
  return {top:vis,rep};}

/* ---------- 그리기 ---------- */
function composer(hid,parent){
  const w=canWrite();const pid=parent||"";
  if(!w.ok){
    if(parent)return "";
    const msg={login:`<a class="btn sm primary" href="#login" data-cm-login="${E(hid)}">로그인하고 댓글 쓰기</a>`,
      loading:`<span class="fine">회원 정보를 불러오는 중…</span>`,
      hospital:`<span class="fine">병원 관계자 계정은 댓글을 쓸 수 없어요. 후기에 대한 병원 입장은 '반론'으로 남겨 주세요.</span>`,
      consent:`<span class="fine">댓글을 쓰려면 필수 약관 동의가 필요해요.</span><a class="btn sm" href="#mypage">동의하러 가기</a>`}[w.why];
    return `<div class="cm-bar" style="justify-content:flex-start">${msg}</div>`;
  }
  return `<form class="cm-form" data-cm-form="${E(hid)}" data-parent="${E(pid)}">
    <textarea maxlength="${MAX}" rows="${parent?2:3}" placeholder="${parent?"답글을 남겨 주세요":"궁금한 점이나 짧은 정보를 나눠 주세요 (예: 주차 가능한가요? 대기 얼마나 걸렸어요?)"}" aria-label="${parent?"답글":"댓글"} 입력"></textarea>
    <div class="cm-bar"><span class="cm-cnt">0 / ${MAX}</span>${parent?`<button type="button" class="btn sm" data-cm-cancel="${E(hid)}">취소</button>`:""}<button type="submit" class="btn sm primary">${parent?"답글 등록":"댓글 등록"}</button></div>
  </form>`;
}
function item(hid,c,isReply){
  const s=st(hid);const mine=s.mine.has(c.id);const del=c.status==="deleted";const hid_=c.status==="hidden";
  const acts=[];
  if(!del&&!hid_){
    if(!isReply)acts.push(`<button type="button" data-cm-reply="${c.id}">답글</button>`);
    if(mine||mod())acts.push(`<button type="button" data-cm-del="${c.id}">삭제</button>`);
    if(!mine&&typeof S!=="undefined"&&S.user)acts.push(`<button type="button" data-cm-report="${c.id}">신고</button>`);
    if(mod()&&!mine)acts.push(`<button type="button" data-cm-hide="${c.id}" data-on="1">숨김</button>`);
  }else if(hid_&&mod()){acts.push(`<button type="button" data-cm-hide="${c.id}" data-on="0">복구</button>`,`<button type="button" data-cm-del="${c.id}">삭제</button>`)}
  const rpt=s.reportFor===c.id?`<div class="cm-rep"><select aria-label="신고 사유" id="cm-rr-${c.id}"><option>욕설·비방</option><option>광고·홍보</option><option>개인정보 노출</option><option>허위 사실</option><option>기타</option></select><button type="button" class="btn sm danger" data-cm-report-go="${c.id}">신고하기</button><button type="button" class="btn sm" data-cm-report-x="${c.id}">취소</button></div>`:"";
  return `<div class="cm-item${hid_?" cm-hidden":""}" id="cm-${c.id}">
    <div class="cm-head"><b>${E(c.nickname||"익명")}</b>${c.is_mod?`<span class="badge ver">운영자</span>`:""}${mine?`<span class="badge plain">내 댓글</span>`:""}${hid_?`<span class="badge pend">숨김(신고 누적·운영자 검토)</span>`:""}<span class="cm-time">${ago(c.created_at)}</span></div>
    <p class="cm-body${del?" del":""}">${E(del?"삭제된 댓글입니다.":c.body)}</p>
    ${acts.length?`<div class="cm-act">${acts.join("")}</div>`:""}${rpt}</div>`;
}
function inner(hid){
  const s=st(hid);
  if(!s.loaded){if(!s.loading)setTimeout(()=>load(hid),0);}
  const {top,rep}=tree(hid);
  const n=s.list.filter(c=>c.status==="visible").length;
  const list=!s.loaded?`<div class="empty">댓글을 불러오는 중…</div>`
    :top.length?top.slice(0,s.shown).map(c=>{
      const rs=rep[c.id]||[];const open=s.open[c.id]||rs.length<=REPLY_FOLD;const showR=open?rs:rs.slice(-REPLY_FOLD);
      return `<div class="cm-thread">${item(hid,c,false)}${rs.length||s.replyTo===c.id?`<div class="cm-replies">${!open?`<button type="button" class="linkbtn" data-cm-unfold="${c.id}">이전 답글 ${rs.length-REPLY_FOLD}개 더 보기</button>`:""}${showR.map(r=>item(hid,r,true)).join("")}${s.replyTo===c.id?composer(hid,c.id):""}</div>`:""}</div>`}).join("")
      +(top.length>s.shown?`<button type="button" class="btn sm cm-more" data-cm-more="${E(hid)}">댓글 더 보기 (${top.length-s.shown})</button>`:"")
    :`<div class="empty">아직 댓글이 없어요. 이 병원에 대해 궁금한 점을 먼저 물어보세요.</div>`;
  return `<div class="card-h"><h2>가벼운 댓글 <span class="src" style="font-weight:400">${s.loaded?n+"개":""}</span></h2><span class="src">후기와 별개 · 질문·정보 나눔</span></div>
    <div class="card-b">
      <p class="fine cm-note">진료 경험 평가는 <a href="#write-${E(hid)}">후기</a>로 남겨 주세요. 댓글은 지수에 반영되지 않으며, 링크·전화번호는 쓸 수 없고 신고가 3건 쌓이면 자동으로 숨겨져요.</p>
      ${composer(hid,null)}
      <div class="cm-list">${list}</div>
    </div>`;
}
function box(hid){return `<section class="card cm" id="cm-box" data-hid="${E(hid)}">${inner(hid)}</section>`}
function paint(hid){const el=document.getElementById("cm-box");if(!el||el.dataset.hid!==hid)return;
  // 입력 중인 내용 보존
  const drafts={};el.querySelectorAll("[data-cm-form]").forEach(f=>{drafts[f.dataset.parent||"_"]=f.querySelector("textarea").value});
  el.innerHTML=inner(hid);
  el.querySelectorAll("[data-cm-form]").forEach(f=>{const v=drafts[f.dataset.parent||"_"];if(v){const ta=f.querySelector("textarea");ta.value=v;cnt(ta)}});
}
function cnt(ta){const c=ta.closest("form").querySelector(".cm-cnt");if(c)c.textContent=`${ta.value.length} / ${MAX}`}

/* ---------- 병원 상세에 끼워 넣기 ---------- */
const baseReal=realView;
realView=function(id){
  const html=baseReal(id);
  const mark='<details class="card more">';
  const b=box(id);
  if(html.includes(mark))return html.replace(mark,b+mark);
  const i=html.indexOf("<aside");return i>0?html.slice(0,i).replace(/<\/div>\s*$/,b+"</div>")+html.slice(i):html+b;
};

/* ---------- 이벤트 ---------- */
document.addEventListener("input",e=>{if(e.target.matches(".cm textarea"))cnt(e.target)});
document.addEventListener("submit",async e=>{
  const f=e.target.closest("[data-cm-form]");if(!f)return;e.preventDefault();
  const hid=f.dataset.cmForm,parent=f.dataset.parent||null;const ta=f.querySelector("textarea");const body=ta.value.trim();
  if(!body){T("내용을 입력해 주세요.");ta.focus();return}
  if(body.length>MAX){T(`${MAX}자 이내로 써 주세요.`);return}
  const btn=f.querySelector("[type=submit]");btn.disabled=true;
  const {data,error}=await sbq().from("hospital_comments").insert({hospital_id:hid,parent_id:parent,body}).select("id,parent_id,nickname,is_mod,body,status,created_at").single();
  btn.disabled=false;
  if(error){T(errMsg(error.message));return}
  const s=st(hid);s.list.unshift(data);s.mine.add(data.id);s.replyTo=null;if(parent)s.open[parent]=true;ta.value="";
  paint(hid);T(parent?"답글을 남겼어요.":"댓글을 남겼어요.");
});
document.addEventListener("click",async e=>{
  const t=e.target;const boxEl=t.closest("#cm-box");if(!boxEl)return;const hid=boxEl.dataset.hid;const s=st(hid);
  let el;
  if((el=t.closest("[data-cm-login]"))){typeof S!=="undefined"&&(S.after="hosp-"+hid);return}
  if((el=t.closest("[data-cm-reply]"))){e.preventDefault();const w=canWrite();
    if(!w.ok){if(w.why==="login"){S.after="hosp-"+hid;location.hash="login"}else T(w.why==="hospital"?"병원 관계자 계정은 댓글을 쓸 수 없어요.":"필수 약관 동의 후 이용할 수 있어요.");return}
    s.replyTo=s.replyTo===el.dataset.cmReply?null:el.dataset.cmReply;paint(hid);
    const ta=boxEl.querySelector(`[data-parent="${s.replyTo}"] textarea`);if(ta)ta.focus();return}
  if((el=t.closest("[data-cm-cancel]"))){e.preventDefault();s.replyTo=null;paint(hid);return}
  if((el=t.closest("[data-cm-unfold]"))){e.preventDefault();s.open[el.dataset.cmUnfold]=true;paint(hid);return}
  if((el=t.closest("[data-cm-more]"))){e.preventDefault();s.shown+=PAGE;paint(hid);return}
  if((el=t.closest("[data-cm-del]"))){e.preventDefault();if(!confirm("이 댓글을 삭제할까요? 답글이 있으면 '삭제된 댓글입니다'로 남아요."))return;
    const {data,error}=await sbq().rpc("delete_hospital_comment",{p_id:el.dataset.cmDel});
    if(error||!data||!data.ok){T(errMsg(error&&error.message));return}
    s.loaded=false;await load(hid,true);T("삭제했어요.");return}
  if((el=t.closest("[data-cm-report]"))){e.preventDefault();s.reportFor=s.reportFor===el.dataset.cmReport?null:el.dataset.cmReport;paint(hid);return}
  if((el=t.closest("[data-cm-report-x]"))){e.preventDefault();s.reportFor=null;paint(hid);return}
  if((el=t.closest("[data-cm-report-go]"))){e.preventDefault();const id=el.dataset.cmReportGo;const sel=document.getElementById("cm-rr-"+id);
    const {error}=await sbq().from("reports").insert({target_type:"comment",target_id:id,reason:sel?sel.value:"기타"});
    s.reportFor=null;paint(hid);T(error?errMsg(error.message):"신고를 접수했어요. 운영자가 확인할게요.");return}
  if((el=t.closest("[data-cm-hide]"))){e.preventDefault();
    const {data,error}=await sbq().rpc("moderate_hospital_comment",{p_id:el.dataset.cmHide,p_hide:el.dataset.on==="1"});
    if(error||!data||!data.ok){T(errMsg(error&&error.message));return}
    await load(hid,true);T(el.dataset.on==="1"?"숨겼어요.":"복구했어요.");return}
});

/* 로그인 상태가 바뀌면 작성창·내 댓글 표시를 다시 그림 (프로필 적재 대기) */
if(sbq()&&sbq().auth)sbq().auth.onAuthStateChange(()=>{
  const el=document.getElementById("cm-box");if(!el)return;const hid=el.dataset.hid;
  setTimeout(()=>{st(hid).loaded=false;load(hid,true)},900);
});

/* ---------- 운영자 화면(#moderate)에 '신고·숨김 댓글' 카드 추가 ---------- */
let FLAG=null;
async function loadFlag(){const {data}=await sbq().rpc("flagged_hospital_comments");FLAG=data||[];paintFlag()}
function paintFlag(){
  if(location.hash!=="#moderate"||!mod())return;
  const v=document.getElementById("view");if(!v)return;
  let el=document.getElementById("cm-mod");
  if(!el){el=document.createElement("section");el.className="card cm";el.id="cm-mod";v.appendChild(el)}
  const H=typeof REAL_BY_ID!=="undefined"?REAL_BY_ID:{};
  const rows=FLAG===null?`<div class="empty">불러오는 중…</div>`:FLAG.length?FLAG.map(c=>{const h=H[c.hospital_id];return `<div class="cm-item${c.status==="hidden"?" cm-hidden":""}">
    <div class="cm-head">${c.status==="hidden"?`<span class="badge pend">숨김</span>`:`<span class="badge plain">공개 중</span>`}<span class="badge plain">신고 ${c.report_count}</span>${c.parent_id?`<span class="badge plain">답글</span>`:""}<b>${E(c.nickname||"익명")}</b><a class="src" href="#hosp-${E(c.hospital_id)}">${E(h?h.name:c.hospital_id)}</a><span class="cm-time">${ago(c.created_at)}</span></div>
    <p class="cm-body">${E(c.body)}</p>
    <div class="row" style="justify-content:flex-end"><button class="btn sm${c.status==="hidden"?" primary":""}" data-cmm-hide="${c.id}" data-on="${c.status==="hidden"?"0":"1"}">${c.status==="hidden"?"복구":"숨김"}</button><button class="btn sm danger" data-cmm-del="${c.id}">삭제</button></div></div>`}).join(""):`<div class="empty">신고되거나 숨겨진 댓글이 없습니다.</div>`;
  el.innerHTML=`<div class="card-h"><h2>병원 댓글 신고·숨김</h2><span class="src">${FLAG?FLAG.filter(c=>c.status==="hidden").length+"건 숨김":"-"} · 3명 신고 시 자동 숨김</span></div><div class="card-b">${rows}</div>`;
}
document.addEventListener("click",async e=>{
  const h=e.target.closest("[data-cmm-hide]"),d=e.target.closest("[data-cmm-del]");if(!h&&!d)return;e.preventDefault();
  const r=h?await sbq().rpc("moderate_hospital_comment",{p_id:h.dataset.cmmHide,p_hide:h.dataset.on==="1"})
           :(confirm("이 댓글을 삭제할까요?")?await sbq().rpc("delete_hospital_comment",{p_id:d.dataset.cmmDel}):null);
  if(!r)return;if(r.error||!r.data||!r.data.ok){T(errMsg(r.error&&r.error.message));return}
  T("처리했어요.");loadFlag();
});
const prevRoute=route;
removeEventListener("hashchange",prevRoute);
route=function(){prevRoute.apply(this,arguments);if(location.hash==="#moderate"&&mod()){paintFlag();if(FLAG===null)loadFlag()}};
addEventListener("hashchange",route);

/* 이미 병원 상세가 열려 있으면 다시 그려 댓글 카드를 붙임 */
if(location.hash.startsWith("#hosp-"))route();
})();
