import { useMemo, useRef, useState } from 'react';
import readXlsxFile, { readSheetNames } from 'read-excel-file';
import { Check, Download, FileSpreadsheet, Upload, Users, Gamepad2, ArrowLeft, X, AlertCircle } from 'lucide-react';
import { parseCsv } from './data.js';
import { normalizeLineRoster, prepareGameImport, prepareLineImport } from './rosterImport.js';

function download(filename, content) {
  const link = document.createElement('a');
  const href = URL.createObjectURL(new Blob(['\uFEFF' + content], { type:'text/csv;charset=utf-8' }));
  link.href = href; link.download = filename; document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1200);
}
const csvCell = text => '"' + String(text ?? '').replace(/"/g, '""') + '"';
const csv = rows => rows.map(row => row.map(csvCell).join(',')).join('\r\n');

export default function RosterImportModal({ records, lineRoster, onLineImport, onGameImport, onClose }) {
  const [type, setType] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const linePreview = useMemo(() => type === 'line' ? prepareLineImport(sheets[0]?.rows || []) : null, [type,sheets]);
  const gamePreview = useMemo(() => type === 'game' ? prepareGameImport(records,sheets) : null, [type,sheets,records]);
  const existingLineKeys = useMemo(() => new Set(lineRoster.map(s => s.trim().toLocaleLowerCase())), [lineRoster]);
  const nextLineKeys = useMemo(() => new Set((linePreview?.names || []).map(s => s.trim().toLocaleLowerCase())), [linePreview]);
  const addedLines = linePreview ? linePreview.names.filter(s => !existingLineKeys.has(s.toLocaleLowerCase())).length : 0;
  const removedLines = lineRoster.filter(s => !nextLineKeys.has(s.toLocaleLowerCase())).length;

  const changeType = next => { setType(next); setSheets([]); setName(''); setError(''); };

  async function readFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true); setError(''); setSheets([]); setName('');
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('檔案不得超過 5 MB');
      const lower = file.name.toLowerCase();
      let result;
      if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
        result = [{name:'整合名單',rows:parseCsv(await file.text())}];
      } else if (lower.endsWith('.xlsx')) {
        if (type === 'line') {
          result = [{name:'LINE 群組',rows:await readXlsxFile(file)}];
        } else {
          const names = await readSheetNames(file);
          if (names.length > 12) throw new Error('Excel 最多讀取 12 個工作表');
          result = await Promise.all(names.map(async name => ({
            name,rows:await readXlsxFile(file,{sheet:name})
          })));
        }
      } else throw new Error('僅支援 .csv、.tsv 或 .xlsx');
      if (!result.some(sheet => sheet.rows.some(row => row.some(value => String(value ?? '').trim())))) throw new Error('找不到有效名單資料');
      const total = result.reduce((sum,sheet) => sum + sheet.rows.length,0);
      if (total > 2100) throw new Error('一次最多處理約 2,000 筆資料');
      setSheets(result); setName(file.name);
    } catch (cause) { setError(cause.message || '無法讀取檔案'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value=''; }
  }

  function sample() {
    if (type === 'line') download('FEV-LINE群組名單範本.csv',csv([
      ['LINE 名稱'],['小明'],['美美'],['阿哲']
    ]));
    else download('FEV-遊戲五團名單範本.csv',csv([
      ['團別','遊戲 ID','隊伍','LINE 名稱','帳號類型'],
      ['第一團','星夜傳說','A隊','小明','主號'],
      ['第二團','星夜分身','B隊','小明','小號'],
      ['第三團','月光少女','A隊','美美','主號'],
      ['第四團','待配對玩家','C隊','','主號'],
      ['第五團','夜之騎士','A隊','阿哲','主號']
    ]));
  }

  function confirm() {
    if (type === 'line' && linePreview?.names.length) {
      if (removedLines && !window.confirm('這會以新名單取代舊 LINE 名單，移除 ' + removedLines + ' 個未出現在檔案內的名稱。原有遊戲資料與人工配對仍會保留，確定繼續？')) return;
      onLineImport(normalizeLineRoster(linePreview.names),{added:addedLines,removed:removedLines,duplicates:linePreview.duplicates});
    } else if (type === 'game' && gamePreview && gamePreview.added + gamePreview.updated) {
      onGameImport(gamePreview);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
      <section className="modal import-modal unified-import" role="dialog" aria-modal="true" aria-labelledby="roster-import-title">
        <div className="modal-heading">
          <div>
            <h2 id="roster-import-title">{type ? (type==='line'?'匯入 LINE 群組名單':'匯入全部遊戲團名單') : '匯入名單'}</h2>
            <p>{type ? '一份名單就能匯入，不用依每個 Tab 個別上傳。' : '選擇 LINE 群組或遊戲團名單；兩種各匯入一次。'}</p>
          </div>
          <button type="button" className="icon-btn" aria-label="關閉" onClick={onClose}><X size={19}/></button>
        </div>
        <div className="modal-body">
          {!type ? (
            <div className="roster-import-options">
              <button className="roster-import-option" onClick={()=>changeType('line')}>
                <span className="roster-option-icon"><Users size={25}/></span>
                <strong>LINE 群組</strong><span>匯入唯一的 LINE 群組全部暱稱</span><small>LINE 名稱 · 一份名單</small>
              </button>
              <button className="roster-import-option" onClick={()=>changeType('game')}>
                <span className="roster-option-icon"><Gamepad2 size={25}/></span>
                <strong>遊戲五團</strong><span>一次匯入第一團到第五團的遊戲 ID</span><small>團別 · 遊戲 ID · 隊伍</small>
              </button>
            </div>
          ) : (
            <>
              <div className="import-help import-top-help">
                <button className="text-link" onClick={()=>changeType(null)}><ArrowLeft size={15}/>返回選擇</button>
                <button className="text-link" onClick={sample}><Download size={15}/>下載{type==='line'?'LINE':'遊戲'}範本</button>
              </div>
              <div className="upload-panel">
                <FileSpreadsheet size={28}/>
                <strong>{name || (type==='line'?'選擇 LINE 名單':'選擇全部遊戲團名單')}</strong>
                <span>{type==='line'?'一欄「LINE 名稱」，用 CSV / Excel':'單一 CSV / Excel 的團別欄，或 Excel 五個團別工作表'}</span>
                <input ref={fileRef} aria-label="選擇匯入檔案" type="file" accept=".xlsx,.csv,.tsv" onChange={readFile}/>
                <button className="btn btn-outline" type="button" disabled={busy} onClick={()=>fileRef.current?.click()}>
                  <Upload size={16}/>{busy?'讀取中…':'選擇 Excel / CSV 檔案'}
                </button>
              </div>
              {error && <p className="form-error" role="alert"><AlertCircle size={16}/>{error}</p>}
              {type==='line' && linePreview && sheets.length>0 && (
                <div className="import-preview-block">
                  <div className="import-heading"><h3>LINE 名單預覽</h3><span className="small-muted">讀取 {linePreview.sourceCount} 行</span></div>
                  <div className="import-stats">
                    <span className="mini-stat positive">有效 {linePreview.names.length}</span>
                    <span className="mini-stat">新增 {addedLines}</span>
                    <span className="mini-stat warning">移除舊名單 {removedLines}</span>
                    <span className="mini-stat neutral">重複／無效 {linePreview.duplicates+linePreview.invalid}</span>
                  </div>
                  <p className="import-notice">將以這份資料更新唯一的 LINE 群組名單。不會刪除遊戲角色或之前人工建立的配對。</p>
                  <div className="roster-name-preview">{linePreview.names.slice(0,30).map((name,i)=><span key={i}>{name}</span>)}</div>
                  {linePreview.names.length>30 && <p className="small-muted">只預覽前 30 筆，匯入會處理全部。</p>}
                </div>
              )}
              {type==='game' && gamePreview && sheets.length>0 && (
                <div className="import-preview-block">
                  <div className="import-heading"><h3>遊戲名單預覽</h3><span className="small-muted">{sheets.length} 個工作表 · 共 {gamePreview.entries.length} 筆</span></div>
                  <div className="import-stats">
                    <span className="mini-stat positive">新增 {gamePreview.added}</span>
                    <span className="mini-stat">更新／移團 {gamePreview.updated}</span>
                    <span className="mini-stat warning">錯誤 {gamePreview.invalid}</span>
                  </div>
                  <p className="import-notice">依「團別」分配到六個 Tab。相同遊戲 ID 會更新團別和隊伍，但保留已經人工配對的 LINE 名稱；檔案沒有出現的舊資料不會自動刪除。</p>
                  <div className="preview-scroll">
                    <table className="preview-table"><thead><tr><th>團別</th><th>遊戲 ID</th><th>隊伍</th><th>結果</th></tr></thead>
                      <tbody>{gamePreview.entries.slice(0,35).map((e,i)=><tr key={i}>
                        <td>{e.group||'—'}</td><td>{e.gameId||'—'}</td><td>{e.team||'—'}</td>
                        <td><span className={'import-action '+e.action} title={e.reason||e.warning||''}>{e.action==='add'?'新增':e.action==='update'?'更新':e.reason||'錯誤'}</span></td>
                      </tr>)}</tbody>
                    </table>
                  </div>
                  {gamePreview.invalid>0&&<p className="small-muted">未填團別／遊戲 ID 或重複的列會被略過。請先檢查並修正檔案。</p>}
                </div>
              )}
              <div className="modal-actions">
                <button className="btn btn-quiet" type="button" onClick={onClose}>取消</button>
                <button className="btn btn-primary" type="button" disabled={busy || (type==='line'?!linePreview?.names.length:!(gamePreview?.added+gamePreview?.updated))} onClick={confirm}>
                  <Check size={17}/>確認匯入{type==='line'?(linePreview?.names.length||0):(gamePreview?.added+gamePreview?.updated||0)}筆
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
