import { useEffect, useMemo, useRef, useState } from 'react';
import readXlsxFile from 'read-excel-file';
import {
  AlertCircle, ArrowLeftRight, Check, CheckCircle2, ChevronRight, CircleHelp,
  Database, Download, FileDown, FileSpreadsheet, FileUp, History,
  Inbox, Pencil, Plus, Search, ShieldAlert, Trash2, Upload, UsersRound, X
} from 'lucide-react';
import {
  GROUPS, DATA_KEY, LOG_KEY, applyPreparedImport, duplicateGame,
  makeId, parseCsv, prepareImport, readLocal, recordsToCsv, validateMember
} from './data.js';

const DEFAULT_FORM = {
  gameId: '', lineName: '', team: '', accountType: 'main', group: GROUPS[0]
};
const FILTERS = [
  { value: 'all', label: '全部成員' },
  { value: 'paired', label: '已配對' },
  { value: 'missing-line', label: '缺 LINE 名稱' },
  { value: 'missing-game', label: '缺遊戲 ID' }
];

function saveFile(filename, text, type) {
  const blob = new Blob([text], { type });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function accountLabel(type) {
  return type === 'alt' ? '小號' : '主號';
}

function PairStatus({ member }) {
  if (!member.gameId) return <span className="status status-warning">缺遊戲 ID</span>;
  if (!member.lineName) return <span className="status status-warning">缺 LINE 名稱</span>;
  return <span className="status status-success"><Check size={13} /> 已配對</span>;
}

function Field({ label, children, hint }) {
  return (
    <label className="form-field">
      <span className="form-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function MemberModal({ form, setForm, editing, error, onSave, onClose }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="member-title">
        <div className="modal-heading">
          <div>
            <h2 id="member-title">{editing ? '編輯成員' : '新增成員'}</h2>
            <p>遊戲 ID、LINE 名稱至少填寫其中一項。</p>
          </div>
          <button type="button" className="icon-btn" aria-label="關閉" onClick={onClose}><X size={19} /></button>
        </div>
        <form onSubmit={onSave} className="modal-body">
          <Field label="遊戲 ID">
            <input value={form.gameId} maxLength={100} autoFocus placeholder="例如：星夜傳說" onChange={(event) => setForm({ ...form, gameId: event.target.value })} />
          </Field>
          <Field label="LINE 名稱">
            <input value={form.lineName} maxLength={100} placeholder="LINE 群組中的顯示名稱" onChange={(event) => setForm({ ...form, lineName: event.target.value })} />
          </Field>
          <div className="form-columns">
            <Field label="隊伍">
              <input value={form.team} maxLength={100} placeholder="例如：A隊" onChange={(event) => setForm({ ...form, team: event.target.value })} />
            </Field>
            <Field label="帳號類型">
              <select value={form.accountType} onChange={(event) => setForm({ ...form, accountType: event.target.value })}>
                <option value="main">主號</option>
                <option value="alt">小號</option>
              </select>
            </Field>
          </div>
          <Field label="所屬團別">
            <select value={form.group} onChange={(event) => setForm({ ...form, group: event.target.value })}>
              {GROUPS.map((group) => <option value={group} key={group}>{group}</option>)}
            </select>
          </Field>
          <div className="helper-note"><CircleHelp size={16} /> 相同 LINE 名稱可以對應多個遊戲 ID，但系統不會自動認定他們是同一個人。</div>
          {error && <p className="form-error" role="alert"><AlertCircle size={16} /> {error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-quiet" onClick={onClose}>取消</button>
            <button type="submit" className="btn btn-primary"><Check size={17} /> 儲存</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ImportModal({ group, records, onImport, onClose }) {
  const inputRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [filename, setFilename] = useState('');
  const [strategy, setStrategy] = useState('skip');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => prepareImport(records, rows, group, strategy), [records, rows, group, strategy]);
  const actionable = preview.added + preview.updated;

  async function loadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setRows([]);
    setFilename('');
    setBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('單一檔案不可超過 5 MB。');
      const name = file.name.toLowerCase();
      let parsed;
      if (name.endsWith('.csv') || name.endsWith('.tsv')) parsed = parseCsv(await file.text());
      else if (name.endsWith('.xlsx')) parsed = await readXlsxFile(file);
      else throw new Error('僅支援 .xlsx、.csv 或 .tsv 檔案。');
      if (!parsed.length) throw new Error('檔案沒有可匯入的資料。');
      if (parsed.length > 2001) throw new Error('一次最多匯入 2,000 筆資料。');
      setRows(parsed);
      setFilename(file.name);
    } catch (cause) {
      setError(cause.message || '讀取失敗，請檢查檔案格式。');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function sample() {
    saveFile('公會匯入範本.csv', recordsToCsv([
      { gameId: '範例玩家01', lineName: '小明', team: 'A隊', accountType: 'main' },
      { gameId: '範例分身01', lineName: '小明', team: 'B隊', accountType: 'alt' },
      { gameId: '', lineName: '尚未進團的人', team: '', accountType: 'main' }
    ]), 'text/csv;charset=utf-8');
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <div className="modal-heading">
          <div>
            <h2 id="import-title">匯入{group}名單</h2>
            <p>匯入後資料會歸到「{group}」，不影響其他團別的非重複帳號。</p>
          </div>
          <button className="icon-btn" aria-label="關閉" onClick={onClose}><X size={19} /></button>
        </div>
        <div className="modal-body">
          <div className="upload-panel">
            <FileSpreadsheet size={28} />
            <strong>{filename || '選擇 Excel 或 CSV 名單'}</strong>
            <span>支援 .xlsx、.csv、.tsv · 最多 2,000 筆</span>
            <input aria-label="選擇匯入檔案" ref={inputRef} type="file" accept=".xlsx,.csv,.tsv" onChange={loadFile} />
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => inputRef.current?.click()}>
              <Upload size={16} /> {busy ? '讀取中…' : '選擇檔案'}
            </button>
          </div>
          <div className="import-help">
            <span>欄位：遊戲 ID、LINE 名稱、隊伍、帳號類型（主號／小號）</span>
            <button className="text-link" onClick={sample}><Download size={15} /> 下載範本</button>
          </div>
          {error && <p className="form-error" role="alert"><AlertCircle size={16} /> {error}</p>}
          {rows.length > 0 && (
            <>
              <div className="import-heading">
                <h3>匯入預覽</h3>
                <span className="small-muted">共 {preview.entries.length} 筆</span>
              </div>
              <div className="import-stats">
                <span className="mini-stat positive">新增 {preview.added}</span>
                <span className="mini-stat">更新 {preview.updated}</span>
                <span className="mini-stat neutral">跳過 {preview.skipped}</span>
                <span className="mini-stat warning">錯誤 {preview.invalid}</span>
              </div>
              <div className="radio-panel">
                <strong>如果遊戲 ID 已存在其他團別</strong>
                <label><input type="radio" name="duplicate" value="skip" checked={strategy === 'skip'} onChange={() => setStrategy('skip')} /> 跳過，不更動原資料</label>
                <label><input type="radio" name="duplicate" value="replace" checked={strategy === 'replace'} onChange={() => setStrategy('replace')} /> 更新資料並移到{group}</label>
              </div>
              <div className="preview-scroll">
                <table className="preview-table">
                  <thead><tr><th>行</th><th>遊戲 ID</th><th>LINE 名稱</th><th>隊伍</th><th>處理</th></tr></thead>
                  <tbody>
                    {preview.entries.slice(0, 30).map((entry) => (
                      <tr key={entry.rowNumber}>
                        <td>{entry.rowNumber}</td>
                        <td>{entry.gameId || '—'}</td>
                        <td>{entry.lineName || '—'}</td>
                        <td>{entry.team || '—'}</td>
                        <td><span className={'import-action ' + entry.action} title={entry.reason || entry.existingGroup || ''}>
                          {entry.action === 'add' ? '新增' : entry.action === 'update' ? '更新' : entry.action === 'skip' ? '跳過' : '錯誤'}
                        </span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.entries.length > 30 && <p className="preview-more">僅顯示前 30 筆，確認時會處理全部資料。</p>}
              </div>
              {preview.invalid > 0 && <p className="small-muted">有 {preview.invalid} 筆內容不完整或重複，將略過這些資料。</p>}
            </>
          )}
          <div className="modal-actions">
            <button className="btn btn-quiet" onClick={onClose}>取消</button>
            <button className="btn btn-primary" disabled={!actionable || busy} onClick={() => onImport(preview, group)}>
              <Check size={17} /> 確認匯入 {actionable} 筆
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function LogModal({ logs, onClose }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="log-title">
        <div className="modal-heading">
          <div>
            <h2 id="log-title">操作紀錄</h2>
            <p>目前只記錄本瀏覽器的操作，尚未接 Google 登入與多人稽核紀錄。</p>
          </div>
          <button className="icon-btn" aria-label="關閉" onClick={onClose}><X size={19} /></button>
        </div>
        <div className="modal-body">
          {logs.length ? (
            <div className="log-list">
              {logs.map((log) => (
                <div className="log-item" key={log.id}>
                  <span className="log-dot" />
                  <div><strong>{log.action}</strong><p>{log.detail}</p><time>{new Date(log.at).toLocaleString('zh-TW')} · 此裝置</time></div>
                </div>
              ))}
            </div>
          ) : <div className="empty-compact"><History size={28} /><p>尚無操作紀錄</p></div>}
          <div className="modal-actions"><button className="btn btn-outline" onClick={onClose}>關閉</button></div>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [records, setRecords] = useState(() => {
    const saved = readLocal(DATA_KEY, []);
    return Array.isArray(saved) ? saved : [];
  });
  const [logs, setLogs] = useState(() => {
    const saved = readLocal(LOG_KEY, []);
    return Array.isArray(saved) ? saved : [];
  });
  const [group, setGroup] = useState(GROUPS[0]);
  const [search, setSearch] = useState('');
  const [searchAll, setSearchAll] = useState(false);
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const backupRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(DATA_KEY, JSON.stringify(records)); }
    catch { setNotice('儲存空間不足或被禁止，資料可能無法保留，請先匯出備份。'); }
  }, [records]);

  useEffect(() => {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(logs)); } catch { /* Browser storage may be disabled. */ }
  }, [logs]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') setModal(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function track(action, detail) {
    setLogs((previous) => [{ id: makeId(), action, detail, at: new Date().toISOString() }, ...previous].slice(0, 200));
  }

  function openNew() {
    setEditing(null);
    setForm({ ...DEFAULT_FORM, group });
    setFormError('');
    setModal('member');
  }

  function openEdit(member) {
    setEditing(member.id);
    setForm({ ...member });
    setFormError('');
    setModal('member');
  }

  function saveMember(event) {
    event.preventDefault();
    const result = validateMember({ ...form, id: editing || '' });
    if (result.error) return setFormError(result.error);
    const duplicate = duplicateGame(records, result.record.gameId, editing);
    if (duplicate) return setFormError('此遊戲 ID 已存在「' + duplicate.group + '」，請編輯原資料或使用匯入更新。');
    if (editing) {
      setRecords((previous) => previous.map((member) => member.id === editing ? result.record : member));
      track('編輯成員', (form.gameId || form.lineName) + ' → ' + form.group);
      setNotice('成員資料已更新');
    } else {
      setRecords((previous) => [...previous, result.record]);
      track('新增成員', (form.gameId || form.lineName) + ' · ' + form.group);
      setNotice('已新增至' + form.group);
    }
    setModal(null);
  }

  function removeMember(member) {
    if (!window.confirm('確定刪除「' + (member.gameId || member.lineName) + '」嗎？這筆資料將從本機移除。')) return;
    setRecords((previous) => previous.filter((item) => item.id !== member.id));
    track('刪除成員', (member.gameId || member.lineName) + ' · ' + member.group);
    setNotice('成員已刪除');
  }

  function importMembers(preview, destination) {
    setRecords((previous) => applyPreparedImport(previous, preview, destination));
    track('匯入名單', destination + ' · 新增 ' + preview.added + ' 筆、更新 ' + preview.updated + ' 筆');
    setNotice(destination + '：新增 ' + preview.added + ' 筆，更新 ' + preview.updated + ' 筆，跳過 ' + (preview.skipped + preview.invalid) + ' 筆');
    setModal(null);
  }

  function exportGroup() {
    const selected = records.filter((item) => item.group === group);
    saveFile(group + '-成員名單.csv', recordsToCsv(selected), 'text/csv;charset=utf-8');
    setNotice('已匯出' + group + '名單');
  }

  function backup() {
    const value = { version: 1, exportedAt: new Date().toISOString(), records, logs };
    saveFile('公會名單備份.json', JSON.stringify(value, null, 2), 'application/json;charset=utf-8');
    setNotice('JSON 備份已下載，請妥善保管檔案。');
  }

  async function restore(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('備份檔不可超過 5 MB');
      const backupData = JSON.parse(await file.text());
      if (backupData.version !== 1 || !Array.isArray(backupData.records) || !Array.isArray(backupData.logs)) throw new Error('不是有效的公會備份格式');
      const validated = backupData.records.map((row) => validateMember(row));
      if (validated.some((item) => item.error)) throw new Error('備份中包含不完整的成員資料');
      const keys = validated.map((item) => item.record.gameId.toLocaleLowerCase()).filter(Boolean);
      if (new Set(keys).size !== keys.length) throw new Error('備份中有重複的遊戲 ID');
      if (!window.confirm('還原會取代目前此瀏覽器的所有名單與操作紀錄。確定繼續？')) return;
      setRecords(validated.map((item) => item.record));
      setLogs(backupData.logs.slice(0, 200));
      setNotice('已還原 ' + validated.length + ' 筆成員資料');
    } catch (cause) {
      setNotice('還原失敗：' + (cause.message || '無法解析檔案'));
    } finally {
      if (backupRef.current) backupRef.current.value = '';
    }
  }

  const totals = useMemo(() => ({
    accounts: records.filter((item) => item.gameId).length,
    paired: records.filter((item) => item.gameId && item.lineName).length,
    pending: records.filter((item) => !item.gameId || !item.lineName).length,
    lines: new Set(records.map((item) => item.lineName?.trim()).filter(Boolean)).size
  }), [records]);

  const visible = useMemo(() => records.filter((member) => {
    if (!searchAll && member.group !== group) return false;
    if (filter === 'paired' && (!member.gameId || !member.lineName)) return false;
    if (filter === 'missing-line' && (!member.gameId || member.lineName)) return false;
    if (filter === 'missing-game' && (!member.lineName || member.gameId)) return false;
    const query = search.trim().toLocaleLowerCase();
    return !query || [member.gameId, member.lineName, member.team, member.group].some((value) => (value || '').toLocaleLowerCase().includes(query));
  }), [records, searchAll, group, filter, search]);

  function selectGroup(next) {
    setGroup(next);
    setSearchAll(false);
    setFilter('all');
    setSearch('');
    setNotice('');
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon"><UsersRound size={24} strokeWidth={2.3} /></div>
          <div><h1>公會成員管理</h1><span>Guild Member Manager</span></div>
        </div>
        <div className="top-actions">
          <span className="local-chip"><Database size={14} /> 本機模式</span>
          <button className="btn btn-quiet compact-button" onClick={() => setModal('log')}><History size={17} /><span>操作紀錄</span></button>
          <button className="btn btn-quiet compact-button" onClick={backup}><Download size={17} /><span>備份</span></button>
          <button className="btn btn-quiet compact-button" onClick={() => backupRef.current?.click()}><Upload size={17} /><span>還原</span></button>
          <input ref={backupRef} type="file" accept=".json,application/json" hidden onChange={restore} aria-label="選擇 JSON 備份檔" />
        </div>
      </header>

      <main className="main-content">
        <div className="page-intro">
          <div><p className="eyebrow">成員管理</p><h2>管理五個團，一眼找到每位成員。</h2><p className="intro-description">依照遊戲團別整理遊戲 ID、LINE 名稱與隊伍；支援小號和跨團搜尋。</p></div>
        </div>

        <div className="summary-grid" aria-label="名單統計">
          <div className="summary-card"><span>遊戲帳號</span><strong>{totals.accounts}</strong><small>全部團別</small></div>
          <div className="summary-card"><span>已配對</span><strong>{totals.paired}</strong><small>同時有遊戲 ID 與 LINE</small></div>
          <div className="summary-card"><span>待配對</span><strong>{totals.pending}</strong><small>缺少其中一項資料</small></div>
          <div className="summary-card"><span>LINE 名稱</span><strong>{totals.lines}</strong><small>去除重複名稱，非獨立人數</small></div>
        </div>

        <section className="roster-panel" aria-label="公會團別名單">
          <div className="tab-scroller">
            <div className="group-tabs" role="tablist" aria-label="團別">
              {GROUPS.map((item) => (
                <button role="tab" aria-selected={item === group} key={item} onClick={() => selectGroup(item)}
                  className={'group-tab ' + (item === group ? 'active' : '')}>
                  <span>{item}</span><span className="tab-count">{records.filter((member) => member.group === item).length}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="roster-inner">
            <div className="section-heading">
              <div><h3>{searchAll ? '所有團別' : group + '名單'}</h3><p>顯示 {visible.length} 筆資料{searchAll ? ' · 跨團搜尋' : ''}</p></div>
              <div className="primary-actions">
                <button className="btn btn-outline" onClick={() => setModal('import')}><FileUp size={17} /> 匯入<span className="optional-label">名單</span></button>
                <button className="btn btn-primary" onClick={openNew}><Plus size={18} /> 新增<span className="optional-label">成員</span></button>
              </div>
            </div>

            <div className="filters">
              <div className="search-box"><Search size={18} /><input value={search} placeholder="搜尋遊戲 ID、LINE 名稱或隊伍…" onChange={(event) => setSearch(event.target.value)} aria-label="搜尋成員" />{search && <button className="search-clear" aria-label="清除搜尋" onClick={() => setSearch('')}><X size={15} /></button>}</div>
              <label className="all-search"><input type="checkbox" checked={searchAll} onChange={(event) => setSearchAll(event.target.checked)} /> 全團搜尋</label>
              <select className="status-select" aria-label="配對狀態" value={filter} onChange={(event) => setFilter(event.target.value)}>
                {FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <button className="btn btn-quiet export-btn" title={'匯出' + group + ' CSV'} onClick={exportGroup}><FileDown size={17} /> 匯出</button>
            </div>

            {notice && <div className="notice" role="status"><CheckCircle2 size={17} /> <span>{notice}</span><button aria-label="關閉提醒" onClick={() => setNotice('')}><X size={15} /></button></div>}

            {visible.length ? (
              <>
                <div className="table-wrapper">
                  <table className="members-table">
                    <thead><tr><th>遊戲 ID</th><th>LINE 名稱</th><th>隊伍</th><th>帳號</th><th>狀態</th><th className="cell-actions">操作</th></tr></thead>
                    <tbody>
                      {visible.map((member) => (
                        <tr key={member.id}>
                          <td><div className="member-strong">{member.gameId || <span className="muted">尚未登記</span>}</div>{searchAll && <span className="member-group">{member.group}</span>}</td>
                          <td>{member.lineName || <span className="muted">尚未配對</span>}</td>
                          <td>{member.team ? <span className="team-tag">{member.team}</span> : <span className="muted">—</span>}</td>
                          <td><span className={'account-tag ' + (member.accountType === 'alt' ? 'alt' : '')}>{accountLabel(member.accountType)}</span></td>
                          <td><PairStatus member={member} /></td>
                          <td><div className="row-actions">
                            <button title="編輯" aria-label={'編輯 ' + (member.gameId || member.lineName)} className="icon-btn" onClick={() => openEdit(member)}><Pencil size={17} /></button>
                            <button title="刪除" aria-label={'刪除 ' + (member.gameId || member.lineName)} className="icon-btn danger-hover" onClick={() => removeMember(member)}><Trash2 size={17} /></button>
                          </div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="member-cards">
                  {visible.map((member) => (
                    <article className="member-card" key={member.id}>
                      <div className="member-card-heading"><div><strong>{member.gameId || '尚未登記遊戲 ID'}</strong>{searchAll && <span>{member.group}</span>}</div><PairStatus member={member} /></div>
                      <div className="member-card-grid"><div><span>LINE 名稱</span><strong>{member.lineName || '未配對'}</strong></div><div><span>隊伍</span><strong>{member.team || '—'}</strong></div></div>
                      <div className="member-card-footer"><span className={'account-tag ' + (member.accountType === 'alt' ? 'alt' : '')}>{accountLabel(member.accountType)}</span><div className="row-actions"><button className="icon-btn" aria-label="編輯" onClick={() => openEdit(member)}><Pencil size={17} /></button><button className="icon-btn danger-hover" aria-label="刪除" onClick={() => removeMember(member)}><Trash2 size={17} /></button></div></div>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">{search || filter !== 'all' ? <Search size={28} /> : <Inbox size={28} />}</div>
                <h4>{search || filter !== 'all' ? '沒有符合條件的成員' : group + '還沒有名單'}</h4>
                <p>{search || filter !== 'all' ? '試著更換搜尋關鍵字或清除篩選條件。' : '可以新增一筆成員，也可以直接匯入 Excel 或 CSV 名單。'}</p>
                {!search && filter === 'all' && <button className="btn btn-outline" onClick={() => setModal('import')}><Upload size={17} /> 匯入{group}名單</button>}
              </div>
            )}
          </div>
        </section>
        <footer className="footer-note"><ShieldAlert size={16} /><span>目前為單機版本：資料僅保存在這個瀏覽器，不會同步到其他管理員。請定期下載備份；公開 GitHub 儲存庫請勿放入真實成員資料。</span></footer>
      </main>

      {modal === 'member' && <MemberModal form={form} setForm={setForm} editing={editing} error={formError} onSave={saveMember} onClose={() => setModal(null)} />}
      {modal === 'import' && <ImportModal group={group} records={records} onImport={importMembers} onClose={() => setModal(null)} />}
      {modal === 'log' && <LogModal logs={logs} onClose={() => setModal(null)} />}
    </div>
  );
}
