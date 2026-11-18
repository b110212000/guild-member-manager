import {useEffect,useMemo,useRef,useState} from 'react';
import {
  AlertTriangle,ArrowLeft,Check,CheckCircle2,Cloud,CloudOff,
  History,Link2,LogOut,Pencil,Plus,RefreshCw,Search,ShieldCheck,
  Trash2,Users,X
} from 'lucide-react';
import PwaControls from './PwaControls.jsx';
import {GROUPS} from './data.js';
import {apiRequest,CLOUD_CONFIG,CLOUD_CONFIGURED,formatSyncTime,createDisplayRows} from './cloudApi.js';
import './cloud.css';

const emptyGame={group:'第一團',gameId:'',team:'',accountType:'main',lineId:''};
const emptyLine={lineName:''};
function statusLabel(state){
  return state==='loading'?'同步中…':state==='error'?'同步失敗':state==='ready'?'雲端已同步':'尚未同步';
}
function GoogleLogin({onToken,error}){
  const node=useRef(null);
  const [state,setState]=useState('loading');
  useEffect(()=>{
    let cancelled=false;
    const script=document.createElement('script');
    script.src='https://accounts.google.com/gsi/client';
    script.async=true;
    script.onload=()=>{
      if(cancelled||!window.google?.accounts?.id){setState('error');return;}
      window.google.accounts.id.initialize({client_id:CLOUD_CONFIG.clientId,
        callback:credential=>onToken(credential.credential),auto_select:false,
        cancel_on_tap_outside:true});
      window.google.accounts.id.renderButton(node.current,{
        theme:'filled_black',size:'large',type:'standard',shape:'pill',text:'signin_with',width:260
      });
      setState('ready');
    };
    script.onerror=()=>setState('error');
    document.head.append(script);
    return()=>{cancelled=true;script.remove();};
  },[onToken]);
  return <div className="cloud-auth-panel">
    <ShieldCheck size={31}/>
    <h2>FEV 管理員登入</h2>
    <p>兩份 Google Sheets 都是私人資料，僅管理員登入後可讀取與編輯。</p>
    <div ref={node} className="cloud-google-button"/>
    {state==='error'&&<p className="cloud-danger">Google 登入元件無法載入，請檢查網路或 Safari 設定。</p>}
    {error&&<p className="cloud-danger">{error}</p>}
  </div>;
}
function Editor({kind,record,lines,busy,error,onClose,onSave}){
  const [form,setForm]=useState(()=>kind==='line'?{...emptyLine,...record}:{...emptyGame,...record});
  const isEdit=Boolean(record?.id);
  const change=(field,value)=>setForm(previous=>({...previous,[field]:value}));
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}>
    <section className="modal cloud-editor" role="dialog" aria-modal="true" aria-label={kind==='line'?'編輯 LINE 成員':'編輯遊戲角色'}>
      <div className="modal-heading"><div><h2>{isEdit?'編輯':'新增'}{kind==='line'?' LINE 成員':'遊戲角色'}</h2><p>儲存會立即寫入私人 Google Sheet。</p></div>
        <button className="icon-btn" onClick={onClose} aria-label="關閉"><X size={19}/></button></div>
      <form className="modal-body" onSubmit={e=>{e.preventDefault();onSave(form);}}>
        {kind==='line'?<label className="form-field"><span className="form-label">LINE 顯示名稱</span>
          <input autoFocus maxLength={100} value={form.lineName||''} onChange={e=>change('lineName',e.target.value)} required/></label>:
          <>
            <label className="form-field"><span className="form-label">遊戲 ID</span>
              <input autoFocus maxLength={100} value={form.gameId||''} onChange={e=>change('gameId',e.target.value)} required/></label>
            <div className="form-columns">
              <label className="form-field"><span className="form-label">團別</span>
                <select value={form.group} onChange={e=>change('group',e.target.value)}>
                  {GROUPS.map(x=><option key={x} value={x}>{x}</option>)}
                </select></label>
              <label className="form-field"><span className="form-label">隊伍</span>
                <input maxLength={100} value={form.team||''} onChange={e=>change('team',e.target.value)}/></label>
            </div>
            <div className="form-columns">
              <label className="form-field"><span className="form-label">帳號</span>
                <select value={form.accountType||'main'} onChange={e=>change('accountType',e.target.value)}>
                  <option value="main">主號</option><option value="alt">小號</option>
                </select></label>
              <label className="form-field"><span className="form-label">對應 LINE 成員</span>
                <select value={form.lineId||''} onChange={e=>change('lineId',e.target.value)}>
                  <option value="">尚未配對</option>
                  {lines.map(line=><option key={line.id} value={line.id}>{line.lineName}</option>)}
                </select></label>
            </div>
            <p className="cloud-tip">同一 LINE 成員可對應多個遊戲角色。系統不會依暱稱猜測配對。</p>
          </>
        }
        {error&&<p className="cloud-danger" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="btn btn-quiet" onClick={onClose} disabled={busy}>取消</button>
          <button type="submit" className="btn btn-primary" disabled={busy}><Check size={17}/>{busy?'儲存中…':'儲存到 Google Sheet'}</button></div>
      </form>
    </section>
  </div>;
}
function LineList({lines,games,busy,onAdd,onEdit,onDelete,onClose}){
  const counts=useMemo(()=>{
    const m=new Map();
    games.forEach(g=>{if(g.lineId)m.set(g.lineId,(m.get(g.lineId)||0)+1);});
    return m;
  },[games]);
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="modal cloud-line-list" role="dialog" aria-modal="true" aria-label="LINE 群組名單">
      <div className="modal-heading"><div><h2>LINE 群組名單</h2><p>唯一 LINE 群組 · 修改會同步到第一份 Google Sheet</p></div>
        <button className="icon-btn" onClick={onClose} aria-label="關閉"><X size={19}/></button></div>
      <div className="modal-body">
        <button className="btn btn-primary" onClick={onAdd}><Plus size={17}/>新增 LINE 成員</button>
        <div className="cloud-lines">
          {lines.length===0?<p className="cloud-empty-short">尚無 LINE 成員，請先建立名單。</p>:lines.map(line=>
            <div className="cloud-line" key={line.id}>
              <div><strong>{line.lineName}</strong><small>{counts.get(line.id)||0} 個遊戲角色</small></div>
              <div className="row-actions">
                <button className="icon-btn" title="編輯 LINE" aria-label={'編輯'+line.lineName} onClick={()=>onEdit(line)}><Pencil size={17}/></button>
                <button className="icon-btn danger-hover" title={counts.get(line.id)?'此 LINE 還有遊戲配對，請先解除':'刪除 LINE'} disabled={busy||Boolean(counts.get(line.id))}
                  aria-label={'刪除'+line.lineName} onClick={()=>onDelete(line)}><Trash2 size={17}/></button>
              </div>
            </div>)}
        </div>
      </div>
    </section>
  </div>;
}
export default function CloudApp(){
  const [token,setToken]=useState(null);
  const [authError,setAuthError]=useState('');
  const [data,setData]=useState({lines:[],games:[],summary:null,syncedAt:''});
  const [status,setStatus]=useState('idle');
  const [error,setError]=useState('');
  const [tab,setTab]=useState(GROUPS[0]);
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('all');
  const [panel,setPanel]=useState(null);
  const [editing,setEditing]=useState(null);
  const [busy,setBusy]=useState(false);
  const [editError,setEditError]=useState('');
  const [audits,setAudits]=useState([]);
  const [notice,setNotice]=useState('');
  const tokenRef=useRef(null);
  const lock=useRef(false);
  const actor=data.actor||'';
  const acceptToken=value=>{tokenRef.current=value;setAuthError('');setToken(value);};
  async function loadData(currentToken=tokenRef.current,silent=false){
    if(!currentToken||lock.current)return;
    lock.current=true;
    if(!silent)setStatus('loading');
    try{
      const fresh=await apiRequest(currentToken,'/api/bootstrap');
      setData(fresh);setStatus('ready');setError('');
    }catch(e){
      setStatus('error');setError(e.message);
      if(e.status===401||e.status===403){tokenRef.current=null;setToken(null);setAuthError(e.message);}
    }finally{lock.current=false;}
  }
  useEffect(()=>{if(token)loadData(token);},[token]);
  useEffect(()=>{
    if(!token)return;
    const id=setInterval(()=>{if(document.visibilityState==='visible'&&!panel)loadData(token,true);},60000);
    return()=>clearInterval(id);
  },[token,panel]);
  const rows=useMemo(()=>createDisplayRows(data.lines,data.games,tab,search,filter),[data.lines,data.games,tab,search,filter]);
  const counts=useMemo(()=>{
    const result={};
    for(const group of GROUPS) result[group]=createDisplayRows(data.lines,data.games,group,'').length;
    return result;
  },[data.lines,data.games]);

  function openEditor(kind,record){
    setEditing({kind,record});setEditError('');setPanel(null);
  }
  async function saveEditor(form){
    if(!token||!editing)return;
    setBusy(true);setEditError('');
    const {kind,record}=editing;
    const plural=kind==='line'?'lines':'games';
    try{
      const body=kind==='line'?{lineName:form.lineName}:{gameId:form.gameId,group:form.group,team:form.team,accountType:form.accountType,lineId:form.lineId};
      if(record?.id)body.expectedUpdatedAt=record.updatedAt;
      const response=await apiRequest(token,'/api/'+plural+(record?.id?'/'+encodeURIComponent(record.id):''),{method:record?.id?'PUT':'POST',body});
      setEditing(null);setNotice(response.auditWarning?'資料已寫入，但稽核紀錄失敗，請通知管理員。':'資料已同步到 Google Sheet');
      await loadData(token);
    }catch(e){
      setEditError(e.message);
      if(e.status===409||e.status===428)await loadData(token,true);
    }finally{setBusy(false);}
  }
  async function remove(kind,record){
    if(!token||busy||!window.confirm('確定刪除「'+(record.lineName||record.gameId)+'」嗎？Google Sheet 會標記刪除，無法直接復原。'))return;
    setBusy(true);
    try{
      const plural=kind==='line'?'lines':'games';
      const res=await apiRequest(token,'/api/'+plural+'/'+encodeURIComponent(record.id),{
        method:'DELETE',body:{expectedUpdatedAt:record.updatedAt}
      });
      setNotice(res.auditWarning?'資料已刪除，但稽核紀錄寫入失敗。':'已同步刪除');
      await loadData(token);setPanel(null);
    }catch(e){
      setError(e.message);setStatus('error');
    }finally{setBusy(false);}
  }
  async function showAudit(){
    setPanel('audit');
    try{setAudits((await apiRequest(token,'/api/audit')).entries||[]);}
    catch(e){setError(e.message);}
  }
  function logout(){
    window.google?.accounts?.id?.disableAutoSelect();
    tokenRef.current=null;setToken(null);setData({lines:[],games:[],summary:null,syncedAt:''});
    setPanel(null);setStatus('idle');
  }
  const s=data.summary||{accountCount:0,lineCount:0,pairedGames:0,unpairedLines:0};
  return <div className="app-shell cloud-app">
    <header className="topbar">
      <div className="brand"><img className="brand-emblem" alt="FEV" src={import.meta.env.BASE_URL+'fev-logo.svg'}/>
        <div><h1>公會管理</h1><span>PRIVATE GOOGLE SHEETS <b>·</b> ROSTER</span></div>
      </div>
      <div className="top-actions"><PwaControls/>
        <span className="cloud-mode-chip"><Cloud size={14}/> 雲端模式</span>
        {token&&<button className="btn btn-quiet compact-button" onClick={logout}><LogOut size={17}/><span>登出</span></button>}
      </div>
    </header>
    <main className="main-content">
      {!CLOUD_CONFIGURED?<section className="cloud-auth-panel cloud-unconfigured">
        <CloudOff size={38}/>
        <h2>Google Sheets 雙向同步尚未啟用</h2>
        <p>前端程式已準備好，但尚未設定私人 Google Sheets、Google OAuth 及 Cloudflare Worker。為了避免誤以為本機資料已同步，目前不會讀寫舊版 localStorage 名單。</p>
        <p className="cloud-tip">舊版資料仍保存在原瀏覽器中，尚未轉移或清除。管理員需先依儲存庫 <code>docs/google-sheets-setup.md</code> 完成配置。</p>
        <a className="cloud-doc-link" href="https://github.com/b110212000/guild-member-manager/blob/main/docs/google-sheets-setup.md" target="_blank" rel="noreferrer">開啟私人 Sheets 設定教學</a>
      </section>:!token?<GoogleLogin onToken={acceptToken} error={authError}/>:<>
        <section className="cloud-hero">
          <div><p className="eyebrow">FEV / CLOUD CLUBHOUSE</p>
            <h2>ROSTER <span>SYNC.</span></h2>
            <p>一份 LINE 群組 · 一份遊戲五團 · 雙向寫回私人 Google Sheets</p>
          </div>
          <div className="cloud-sync-info">
            <span className={'cloud-sync-state '+status}>{status==='ready'?<CheckCircle2 size={16}/>:<RefreshCw size={16}/>} {statusLabel(status)}</span>
            <small>{formatSyncTime(data.syncedAt)}</small>
            <button className="btn btn-outline" disabled={status==='loading'||busy} onClick={()=>loadData()}><RefreshCw size={16}/>重新同步</button>
          </div>
        </section>
        {error&&<div className="cloud-alert" role="alert"><AlertTriangle size={17}/>{error}<button onClick={()=>setError('')} aria-label="關閉"><X size={15}/></button></div>}
        {notice&&<div className="notice" role="status"><CheckCircle2 size={16}/>{notice}<button onClick={()=>setNotice('')} aria-label="關閉"><X size={15}/></button></div>}
        <div className="summary-grid cloud-summary">
          <div className="summary-card"><span>01 / 遊戲帳號</span><strong>{s.accountCount}</strong><small>GAME ACCOUNTS</small></div>
          <div className="summary-card"><span>02 / LINE 名稱</span><strong>{s.lineCount}</strong><small>LINE MEMBERS</small></div>
          <div className="summary-card"><span>03 / 已配對角色</span><strong>{s.pairedGames}</strong><small>LINKED ACCOUNTS</small></div>
          <div className="summary-card"><span>04 / LINE 待配對</span><strong>{s.unpairedLines}</strong><small>NO GAME ACCOUNT</small></div>
        </div>
        <section className="roster-panel">
          <div className="tab-scroller"><div className="group-tabs" role="tablist" aria-label="團別">
            {GROUPS.map((g,i)=><button key={g} className={'group-tab '+(tab===g?'active':'')} role="tab" aria-selected={tab===g}
              onClick={()=>{setTab(g);setFilter('all');}}><span className="tab-index">{i===5?'FA':('0'+(i+1))}</span>
              <span className="tab-label">{g}</span><span className="tab-count">{counts[g]||0}</span></button>)}
          </div></div>
          <div className="roster-inner">
            <div className="section-heading cloud-heading"><div>
              <div className="section-overline"><span className="section-overline-mark"/> PRIVATE ROSTER / {actor}</div>
              <h3>{tab}名單</h3><p>顯示 {rows.length} 筆 · 由私人 Google Sheets 即時讀取</p>
            </div><div className="primary-actions">
              <button className="btn btn-outline" onClick={()=>setPanel('lines')}><Users size={16}/>LINE 名單</button>
              <button className="btn btn-primary" onClick={()=>openEditor('game',null)}><Plus size={17}/>新增角色</button>
            </div></div>
            <div className="filters cloud-filters">
              <div className="search-box"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="搜尋遊戲 ID、LINE 或隊伍…" aria-label="搜尋成員"/></div>
              <select className="status-select" value={filter} onChange={e=>setFilter(e.target.value)} aria-label="配對狀態">
                <option value="all">全部成員</option><option value="paired">已配對</option>
                <option value="game-unpaired">遊戲待配對</option><option value="line-only">LINE 無遊戲</option>
              </select>
              <button className="btn btn-quiet" onClick={()=>{setTab('全部團別');setFilter('all');}}>全團搜尋</button>
              <button className="btn btn-quiet" onClick={showAudit}><History size={16}/>紀錄</button>
            </div>
            <div className="table-wrapper"><table className="members-table">
              <thead><tr><th>遊戲 ID</th><th>LINE 名稱</th><th>隊伍</th><th>帳號</th><th>狀態</th><th>操作</th></tr></thead>
              <tbody>{rows.map(r=><tr key={r.id}>
                <td className="member-strong">{r.gameId||'—'}</td>
                <td>{r.lineName||'尚未配對'}</td><td>{r.team||'—'}</td><td>{r.accountType==='alt'?'小號':r.kind==='line'?'—':'主號'}</td>
                <td>{r.kind==='line'?<span className="status status-warning">LINE 無遊戲</span>:
                  r.lineId?<span className="status status-success">已配對</span>:<span className="status status-warning">待配對</span>}</td>
                <td><div className="row-actions">
                  <button className="icon-btn" title="編輯" onClick={()=>openEditor(r.kind,r.kind==='line'?data.lines.find(l=>l.id===r.lineId):data.games.find(g=>g.id===r.id))}><Pencil size={16}/></button>
                  <button className="icon-btn danger-hover" title="刪除" disabled={busy} onClick={()=>remove(r.kind,r.kind==='line'?data.lines.find(l=>l.id===r.lineId):data.games.find(g=>g.id===r.id))}><Trash2 size={16}/></button>
                </div></td></tr>)}</tbody>
            </table></div>
            <div className="member-cards">{rows.map(r=><article className="member-card" key={r.id}>
              <div className="member-card-heading"><strong>{r.gameId||r.lineName}</strong><span className={'status '+(r.kind==='game'&&r.lineId?'status-success':'status-warning')}>{r.kind==='line'?'LINE 無遊戲':r.lineId?'已配對':'待配對'}</span></div>
              <div className="member-card-grid"><div><span>LINE 名稱</span><strong>{r.lineName||'未配對'}</strong></div><div><span>隊伍</span><strong>{r.team||'—'}</strong></div></div>
              <div className="member-card-footer"><span className="account-tag">{r.kind==='game'?(r.accountType==='alt'?'小號':'主號'):'LINE 成員'}</span>
                <div className="row-actions">
                  <button className="icon-btn" title="編輯" onClick={()=>openEditor(r.kind,r.kind==='line'?data.lines.find(l=>l.id===r.lineId):data.games.find(g=>g.id===r.id))}><Pencil size={16}/></button>
                  <button className="icon-btn danger-hover" title="刪除" disabled={busy} onClick={()=>remove(r.kind,r.kind==='line'?data.lines.find(l=>l.id===r.lineId):data.games.find(g=>g.id===r.id))}><Trash2 size={16}/></button>
                </div></div>
            </article>)}</div>
            {rows.length===0&&<div className="empty-state"><Link2 size={28}/><h4>目前沒有符合條件的成員</h4><p>可新增角色或切換篩選。</p></div>}
          </div>
        </section>
        <footer className="footer-note"><ShieldCheck size={16}/>兩份 Google Sheets 為唯一正式資料來源。需要連線及管理員身分才能讀寫；舊版 localStorage 不會自動上傳。</footer>
      </>}
    </main>
    {editing&&<Editor key={(editing.kind||'')+ (editing.record?.id||'new')} kind={editing.kind} record={editing.record}
      lines={data.lines} busy={busy} error={editError} onClose={()=>setEditing(null)} onSave={saveEditor}/>}
    {panel==='lines'&&<LineList lines={data.lines} games={data.games} busy={busy} onClose={()=>setPanel(null)}
      onAdd={()=>openEditor('line',null)} onEdit={l=>openEditor('line',l)} onDelete={l=>remove('line',l)}/>}
    {panel==='audit'&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setPanel(null);}}>
      <section className="modal cloud-line-list" role="dialog" aria-modal="true" aria-label="操作紀錄">
        <div className="modal-heading"><div><h2>Google Sheets 操作紀錄</h2><p>伺服器寫入遊戲 Sheet 的 Audit 分頁</p></div>
          <button className="icon-btn" onClick={()=>setPanel(null)} aria-label="關閉"><X size={19}/></button></div>
        <div className="modal-body cloud-audit-list">{audits.length?audits.map((item,i)=><div className="cloud-audit" key={i}>
          <strong>{item.action} · {item.entity}</strong><span>{item.actor}</span><small>{formatSyncTime(item.at)}</small>
        </div>):<p className="cloud-empty-short">尚無操作紀錄</p>}</div>
      </section>
    </div>}
  </div>;
}
