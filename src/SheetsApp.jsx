import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import PwaControls from './PwaControls.jsx';
import {GROUPS} from './data.js';
import {API_URL,CLIENT_ID,sheetsRequest,getToken,saveToken} from './sheetClient.js';
import {Check,CheckCircle2,Database,History,LogOut,Plus,RefreshCw,Search,ShieldAlert,Trash2,Pencil,Users,X,Link2,ExternalLink} from 'lucide-react';
import './styles.css';
import './sheets.css';

const lower=value=>String(value||'').trim().toLocaleLowerCase();
const fmtTime=date=>date?new Date(date).toLocaleString('zh-TW'):'尚未同步';
const emptyGame={group:GROUPS[0],gameId:'',team:'',accountType:'main',lineId:''};
const docs='https://github.com/b110212000/guild-member-manager/blob/main/docs/google-sheets-setup.md';

function GoogleSignIn({onToken}){
  const el=useRef(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    if(!CLIENT_ID||!el.current)return;
    let cancelled=false;
    const init=()=>{
      if(cancelled||!window.google?.accounts?.id)return;
      try{
        window.google.accounts.id.initialize({client_id:CLIENT_ID,callback:result=>{if(result.credential)onToken(result.credential);}});
        if(el.current){el.current.replaceChildren();window.google.accounts.id.renderButton(el.current,{
          theme:'filled_black',size:'large',shape:'pill',text:'signin_with',width:250
        });}
      }catch{setError('無法顯示 Google 登入，請確認 OAuth 網域與 Client ID。');}
    };
    let script=document.getElementById('fev-google-gis');
    if(!script){
      script=document.createElement('script');script.id='fev-google-gis';
      script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;
      document.head.appendChild(script);
    }
    if(window.google?.accounts?.id)init();else script.addEventListener('load',init);
    const timer=setTimeout(()=>{if(!cancelled&&!window.google?.accounts?.id)setError('Google 登入服務無法載入。請檢查 Safari 網路及隱私設定。');},10000);
    return()=>{cancelled=true;script.removeEventListener('load',init);clearTimeout(timer);};
  },[onToken]);
  return <section className="fev-login-card">
    <div className="fev-signin-badge">FEV</div>
    <h2>管理員 Google 登入</h2>
    <p>名單存放於兩份私人 Google Sheets。只有獲授權的管理員才能查看、編輯與配對成員。</p>
    <div className="fev-gis-button" ref={el}/>
    {error&&<p className="fev-error">{error}</p>}
    <span className="fev-login-note">登入後才會讀取會員資料；沒有公開訪客名單。</span>
  </section>;
}
function Status({row,lines}){
  if(row.virtual)return <span className="status status-warning">LINE 尚未配對角色</span>;
  if(!row.lineId)return <span className="status status-warning">未配對 LINE</span>;
  if(!lines.some(l=>l.id===row.lineId))return <span className="status status-warning">LINE 連結不存在</span>;
  return <span className="status status-success"><Check size={13}/>已配對</span>;
}
function Editor({type,record,lines,onSave,onClose,pending,error}){
  const isGame=type==='game';
  const [form,setForm]=useState(()=>record?{...record}:isGame?{...emptyGame}: {lineName:''});
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!pending)onClose();}}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-title">
      <div className="modal-heading"><div><h2 id="edit-title">{record?.id?'編輯':'新增'}{isGame?'遊戲角色':'LINE 成員'}</h2>
        <p>按下儲存後，網站會寫回私人 Google Sheets。</p></div>
        <button className="icon-btn" onClick={onClose} disabled={pending} aria-label="關閉"><X size={19}/></button>
      </div>
      <form className="modal-body" onSubmit={e=>{e.preventDefault();onSave(form);}}>
        {isGame?<>
          <label className="form-field"><span className="form-label">遊戲 ID（必填）</span>
            <input autoFocus value={form.gameId||''} maxLength={100} required onChange={e=>setForm({...form,gameId:e.target.value})} placeholder="例如：星夜傳說"/></label>
          <div className="form-columns">
            <label className="form-field"><span className="form-label">所屬團別</span>
              <select value={form.group} onChange={e=>setForm({...form,group:e.target.value})}>{GROUPS.map(g=><option value={g} key={g}>{g}</option>)}</select></label>
            <label className="form-field"><span className="form-label">主號／小號</span>
              <select value={form.accountType||'main'} onChange={e=>setForm({...form,accountType:e.target.value})}>
                <option value="main">主號</option><option value="alt">小號</option></select></label>
          </div>
          <label className="form-field"><span className="form-label">隊伍</span>
            <input value={form.team||''} maxLength={100} onChange={e=>setForm({...form,team:e.target.value})} placeholder="A隊"/></label>
          <label className="form-field"><span className="form-label">配對 LINE 成員</span>
            <select value={form.lineId||''} onChange={e=>setForm({...form,lineId:e.target.value})}>
              <option value="">尚未配對</option>
              {lines.map(l=><option value={l.id} key={l.id}>{l.lineName} · {l.id.slice(0,8)}</option>)}
            </select></label>
          <div className="helper-note"><Link2 size={16}/>LINE 配對使用固定成員 ID，同一位 LINE 成員可連結多個遊戲角色。</div>
        </>:<label className="form-field"><span className="form-label">LINE 名稱（必填）</span>
          <input autoFocus value={form.lineName||''} maxLength={100} required placeholder="LINE 群組顯示名稱" onChange={e=>setForm({...form,lineName:e.target.value})}/></label>}
        {error&&<p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-quiet" disabled={pending} onClick={onClose}>取消</button>
          <button type="submit" className="btn btn-primary" disabled={pending}>{pending?'寫入 Google Sheet 中…':<><Check size={16}/>儲存</>}</button>
        </div>
      </form>
    </section>
  </div>;
}
function Logs({entries,onClose}){
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="logs-title">
      <div className="modal-heading"><div><h2 id="logs-title">管理員操作紀錄</h2>
        <p>來源：第二份私人 Google Sheet 的 Audit 工作表。</p></div>
        <button className="icon-btn" onClick={onClose} aria-label="關閉"><X size={19}/></button></div>
      <div className="modal-body"><div className="log-list">{entries.length?entries.map((x,i)=><div className="log-item" key={i}>
        <span className="log-dot"/><div><strong>{x.actor} · {x.action==='create'?'新增':x.action==='update'?'更新':'刪除'}{x.entity==='line'?'LINE':'遊戲角色'}</strong>
          <p>{x.id}</p><time>{fmtTime(x.at)}</time></div></div>):<p>尚無操作紀錄。</p>}</div>
        <div className="modal-actions"><button className="btn btn-outline" onClick={onClose}>關閉</button></div></div>
    </section></div>;
}

export default function SheetsApp(){
  const [token,setToken]=useState(getToken);
  const [snapshot,setSnapshot]=useState(null);
  const [group,setGroup]=useState(GROUPS[0]);
  const [search,setSearch]=useState('');
  const [searchAll,setSearchAll]=useState(false);
  const [filter,setFilter]=useState('all');
  const [showLineList,setShowLineList]=useState(false);
  const [dialog,setDialog]=useState(null);
  const [pending,setPending]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [formError,setFormError]=useState('');
  const [notice,setNotice]=useState('');
  const [audit,setAudit]=useState([]);
  const lines=snapshot?.lines||[];
  const games=snapshot?.games||[];
  const lookup=useMemo(()=>new Map(lines.map(l=>[l.id,l])),[lines]);
  const joined=useMemo(()=>{
    const used=new Set(games.map(g=>g.lineId).filter(Boolean));
    const roster=games.map(g=>({...g,lineName:lookup.get(g.lineId)?.lineName||''}));
    const virtual=lines.filter(l=>!used.has(l.id)).map(l=>({
      id:'line-only:'+l.id,virtual:true,lineId:l.id,lineName:l.lineName,gameId:'',team:'',
      group:GROUPS[5],accountType:'main',updatedAt:l.updatedAt
    }));
    return [...roster,...virtual];
  },[lines,games,lookup]);
  const totals=useMemo(()=>({
    games:games.length,linked:games.filter(g=>g.lineId&&lookup.has(g.lineId)).length,
    pending:games.filter(g=>!g.lineId||!lookup.has(g.lineId)).length,lines:lines.length
  }),[lines,games,lookup]);
  const visible=useMemo(()=>joined.filter(r=>{
    if(!searchAll&&r.group!==group)return false;
    if(filter==='paired'&&(!r.gameId||!r.lineId||!lookup.has(r.lineId)))return false;
    if(filter==='game'&&(!r.gameId||(r.lineId&&lookup.has(r.lineId))))return false;
    if(filter==='line'&&r.gameId)return false;
    return !search||[r.gameId,r.lineName,r.group,r.team].some(x=>lower(x).includes(lower(search)));
  }),[joined,searchAll,group,filter,search,lookup]);

  const load=useCallback(async(credential=token,silent=false)=>{
    if(!credential)return;
    if(!silent)setLoading(true);
    try{
      const data=await sheetsRequest(credential,'/api/bootstrap');
      setSnapshot(data);setError('');
    }catch(err){
      if(err.status===401){saveToken('');setToken('');setSnapshot(null);}
      setError(err.message);
    }finally{setLoading(false);}
  },[token]);
  useEffect(()=>{if(token)load(token);},[token,load]);
  useEffect(()=>{
    if(!token)return;
    const id=setInterval(()=>{if(document.visibilityState==='visible'&&!pending)load(token,true);},120000);
    return()=>clearInterval(id);
  },[token,pending,load]);
  const onCredential=useCallback(async(credential)=>{
    saveToken(credential);setError('');setToken(credential);setNotice('');
  },[]);
  const logout=()=>{saveToken('');setToken('');setSnapshot(null);setDialog(null);window.google?.accounts?.id?.disableAutoSelect?.();};

  async function saveForm(data){
    if(!dialog)return;
    setPending(true);setFormError('');
    const plural=dialog.type==='line'?'lines':'games';
    const item=dialog.record;
    const route='/api/'+plural+(item?.id?'/'+item.id:'');
    const method=item?.id?'PUT':'POST';
    const payload={...(dialog.type==='line'?{lineName:data.lineName}:{
      group:data.group,gameId:data.gameId,team:data.team,accountType:data.accountType,lineId:data.lineId
    }),...(item?.id?{expectedUpdatedAt:item.updatedAt}:{})};
    try{
      const response=await sheetsRequest(token,route,method,payload);
      setDialog(null);
      await load(token,true);
      setNotice(response.auditWarning?'資料已寫入 Sheet，但 Audit 紀錄失敗；請檢查 Worker。':'變更已成功寫入 Google Sheet。');
    }catch(err){
      setFormError(err.message);
    }finally{setPending(false);}
  }
  async function remove(kind,item){
    if(!window.confirm('確定刪除「'+(kind==='line'?item.lineName:item.gameId)+'」？此操作會寫回 Google Sheet。'))return;
    setPending(true);setError('');
    try{
      const res=await sheetsRequest(token,'/api/'+(kind==='line'?'lines':'games')+'/'+item.id,'DELETE',{expectedUpdatedAt:item.updatedAt});
      await load(token,true);
      setNotice(res.auditWarning?'已標記刪除，但 Audit 記錄寫入失敗。':'已在 Google Sheet 標記刪除。');
    }catch(err){setError(err.message);}finally{setPending(false);}
  }
  async function showAudit(){
    setPending(true);setError('');
    try{
      const result=await sheetsRequest(token,'/api/audit');
      setAudit(result.entries||[]);setDialog({type:'audit'});
    }catch(err){setError(err.message);}finally{setPending(false);}
  }
  const open=(type,record=null)=>{setFormError('');setDialog({type,record});};
  const chooseGroup=g=>{setGroup(g);setSearch('');setFilter('all');setSearchAll(false);};

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><img className="brand-emblem" src={import.meta.env.BASE_URL+'fev-logo.svg'} alt="FEV"/>
        <div><h1>公會管理</h1><span>BASEBALL CLUBHOUSE <b>·</b> LIVE SHEETS</span></div></div>
      <div className="top-actions">
        <PwaControls/>
        {snapshot&&<><span className="local-chip"><Database size={14}/>私人 Sheets</span>
          <button className="btn btn-quiet compact-button" disabled={pending||loading} title="重新同步" onClick={()=>load(token)}>
            <RefreshCw size={17}/><span>同步</span></button>
          <button className="btn btn-quiet compact-button" title="操作紀錄" onClick={showAudit}><History size={17}/><span>紀錄</span></button>
          <button className="btn btn-quiet compact-button" title="登出" onClick={logout}><LogOut size={17}/><span>登出</span></button></>}
      </div>
    </header>
    <main className="main-content">
      {!API_URL||!CLIENT_ID?<section className="fev-setup">
        <ShieldAlert size={32}/><h2>私人 Google Sheets 尚未完成設定</h2>
        <p>此版本已停用本機匯入／匯出模式。必須先設定 Cloudflare Worker、Google OAuth 和兩份私人試算表，才能使用管理功能。</p>
        <p>舊版儲存在瀏覽器的資料不會被刪除，但也不會自動上傳。</p>
        <a href={docs} target="_blank" rel="noopener noreferrer">查看設定教學 <ExternalLink size={15}/></a>
      </section>:!snapshot?<>
        <GoogleSignIn onToken={onCredential}/>
        {loading&&<p className="fev-login-state">正在驗證 Google 管理員身份並讀取私人 Sheets…</p>}
        {error&&<p className="form-error fev-message">{error}</p>}
      </>:<>
        <div className="page-intro">
          <img className="baseball-background" src={import.meta.env.BASE_URL+'baseball-field.svg'} alt="" aria-hidden="true"/>
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-dot"/>FEV BASEBALL CLUB <span className="hero-eyebrow-separator">//</span> ROSTER</p>
            <h2><span className="hero-title-english">OWN THE</span> <span className="hero-title-accent">ROSTER.</span></h2>
            <p className="hero-title-chinese">五團名單，Google Sheets 雙向同步。</p>
            <p className="intro-description">LINE × 遊戲帳號 · 主號／小號固定 ID 配對 · 管理員專用</p>
            <div className="hero-footline"><span className="live-light"/> PRIVATE SHEETS <span className="hero-rule"/> FEV CLUBHOUSE</div>
          </div>
          <div className="hero-visual" aria-hidden="true"><img src={import.meta.env.BASE_URL+'fev-logo.svg'} alt=""/></div>
        </div>
        <div className="fev-syncbar"><CheckCircle2 size={16}/>私人 Sheets 已連線 · {snapshot.actor}
          <span>最後同步：{fmtTime(snapshot.syncedAt)}</span>
          <button onClick={()=>load(token)} disabled={pending||loading}><RefreshCw size={14}/>{loading?'同步中':'重新整理'}</button>
        </div>
        {notice&&<div className="notice" role="status"><CheckCircle2 size={16}/>{notice}<button onClick={()=>setNotice('')} aria-label="關閉"><X size={14}/></button></div>}
        {error&&<div className="form-error fev-message" role="alert">{error}<button onClick={()=>setError('')} aria-label="關閉"><X size={14}/></button></div>}
        <div className="summary-grid">
          <div className="summary-card"><span><span className="stat-id">01</span>遊戲角色</span><strong>{totals.games}</strong><small>GAME ACCOUNTS</small></div>
          <div className="summary-card"><span><span className="stat-id">02</span>已配對</span><strong>{totals.linked}</strong><small>LINKED ACCOUNTS</small></div>
          <div className="summary-card"><span><span className="stat-id">03</span>待配對</span><strong>{totals.pending}</strong><small>NEEDS MATCHING</small></div>
          <div className="summary-card"><span><span className="stat-id">04</span>LINE 成員</span><strong>{totals.lines}</strong><small>ONE LINE GROUP</small></div>
        </div>
        <section className="roster-panel">
          <div className="tab-scroller"><div className="group-tabs" role="tablist" aria-label="公會團別">
            {GROUPS.map((g,i)=><button role="tab" aria-selected={group===g} onClick={()=>chooseGroup(g)}
              className={'group-tab '+(group===g?'active':'')} key={g}>
              <span className="tab-index">{i===5?'FA':String(i+1).padStart(2,'0')}</span><span>{g}</span>
              <span className="tab-count">{joined.filter(row=>row.group===g).length}</span>
            </button>)}
          </div></div>
          <div className="roster-inner">
            <div className="section-heading"><div><div className="section-overline"><span className="section-overline-mark"/> SHEETS LIVE <span>/</span> PLAYER ROSTER</div>
              <h3>{searchAll?'所有團別':group+'名單'}</h3><p>顯示 {visible.length} 筆 · 即時寫回私人試算表</p></div>
              <div className="primary-actions">
                <button className="btn btn-outline" onClick={()=>setShowLineList(!showLineList)}><Users size={16}/>LINE 名單</button>
                <button className="btn btn-primary" onClick={()=>open('game')}><Plus size={17}/>新增角色</button>
              </div>
            </div>
            <div className="filters">
              <div className="search-box"><Search size={18}/><input aria-label="搜尋成員" placeholder="搜尋遊戲 ID、LINE 名稱或隊伍…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
              <label className="all-search"><input type="checkbox" checked={searchAll} onChange={e=>setSearchAll(e.target.checked)}/>全團搜尋</label>
              <select className="status-select" aria-label="配對狀態" value={filter} onChange={e=>setFilter(e.target.value)}>
                <option value="all">全部成員</option><option value="paired">已配對</option>
                <option value="game">遊戲未配對</option><option value="line">LINE 無遊戲</option>
              </select>
            </div>
            {showLineList&&<div className="fev-line-management">
              <div className="fev-line-head"><strong>共同 LINE 群組 · {lines.length} 人</strong><button className="btn btn-outline" onClick={()=>open('line')}><Plus size={15}/>新增 LINE</button></div>
              {lines.length?<div className="fev-line-items">{lines.map(line=><div key={line.id}>
                <span>{line.lineName}</span><div className="row-actions">
                  <button className="icon-btn" title="編輯 LINE" onClick={()=>open('line',line)}><Pencil size={16}/></button>
                  <button className="icon-btn danger-hover" title="刪除 LINE" disabled={pending} onClick={()=>remove('line',line)}><Trash2 size={16}/></button>
                </div></div>)}</div>:<p>還沒有 LINE 名單，請先新增 LINE 成員。</p>}
            </div>}
            {visible.length?<><div className="table-wrapper"><table className="members-table"><thead>
              <tr><th>遊戲 ID</th><th>LINE 名稱</th><th>隊伍</th><th>類型</th><th>狀態</th><th className="cell-actions">操作</th></tr></thead>
              <tbody>{visible.map(row=><tr key={row.id}>
                <td><div className="member-strong">{row.gameId||<span className="muted">尚未登記遊戲角色</span>}</div>{searchAll&&<span className="member-group">{row.group}</span>}</td>
                <td>{row.lineName||<span className="muted">尚未配對</span>}</td>
                <td>{row.team?<span className="team-tag">{row.team}</span>:'—'}</td>
                <td><span className={'account-tag '+(row.accountType==='alt'?'alt':'')}>{row.virtual?'—':row.accountType==='alt'?'小號':'主號'}</span></td>
                <td><Status row={row} lines={lines}/></td>
                <td><div className="row-actions">
                  <button className="icon-btn" title="編輯" onClick={()=>open(row.virtual?'line':'game',row.virtual?lookup.get(row.lineId):row)}><Pencil size={16}/></button>
                  {!row.virtual&&<button className="icon-btn danger-hover" title="刪除" disabled={pending} onClick={()=>remove('game',row)}><Trash2 size={16}/></button>}
                  {row.virtual&&<button className="icon-btn" title="建立此 LINE 的遊戲角色" onClick={()=>setDialog({type:'game',record:null,initialLineId:row.lineId})}><Plus size={16}/></button>}
                </div></td>
              </tr>)}</tbody></table></div>
              <div className="member-cards">{visible.map(row=><article className="member-card" key={row.id}>
                <div className="member-card-heading"><div><strong>{row.gameId||'LINE 尚無遊戲角色'}</strong><span>{row.group}</span></div><Status row={row} lines={lines}/></div>
                <div className="member-card-grid"><div><span>LINE 成員</span><strong>{row.lineName||'未配對'}</strong></div><div><span>隊伍</span><strong>{row.team||'—'}</strong></div></div>
                <div className="member-card-footer"><span className="account-tag">{row.virtual?'LINE':row.accountType==='alt'?'小號':'主號'}</span><div className="row-actions">
                  <button className="icon-btn" title="編輯" onClick={()=>open(row.virtual?'line':'game',row.virtual?lookup.get(row.lineId):row)}><Pencil size={16}/></button>
                  {!row.virtual&&<button className="icon-btn danger-hover" title="刪除" disabled={pending} onClick={()=>remove('game',row)}><Trash2 size={16}/></button>}
                  {row.virtual&&<button className="icon-btn" title="建立角色" onClick={()=>setDialog({type:'game',record:null,initialLineId:row.lineId})}><Plus size={16}/></button>}
                </div></div>
              </article>)}</div></>:
              <div className="empty-state"><h4>目前沒有符合條件的成員</h4><p>可以更改條件、管理 LINE 名單，或直接新增遊戲角色。</p></div>}
          </div>
        </section>
        <footer className="footer-note"><ShieldAlert size={16}/><span>正式資料儲存於兩份私人 Google Sheets，不再以 localStorage 當作共用名單。舊版瀏覽器資料會保留、但不會自動上傳。多人修改透過 updatedAt 檢測衝突；Google Sheets 並非原子交易資料庫。</span></footer>
      </>}
    </main>
    {(dialog?.type==='game'||dialog?.type==='line')&&<Editor key={dialog.record?.id||dialog.initialLineId||dialog.type}
      type={dialog.type} record={dialog.record|| (dialog.initialLineId?{...emptyGame,lineId:dialog.initialLineId}:null)}
      lines={lines} onClose={()=>{if(!pending)setDialog(null);}} onSave={saveForm} pending={pending} error={formError}/>}
    {dialog?.type==='audit'&&<Logs entries={audit} onClose={()=>setDialog(null)}/>}
  </div>;
}
