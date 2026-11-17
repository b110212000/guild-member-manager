export const GROUPS = ['第一團', '第二團', '第三團', '第四團', '第五團', '無遊戲團'];
export const DATA_KEY = 'guild-member-manager:records:v1';
export const LOG_KEY = 'guild-member-manager:audit:v1';

export const normalizeId = (value) => String(value ?? '').trim().toLocaleLowerCase();
const clean = (value) => String(value ?? '').trim();

export function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

export function validateMember(value) {
  const record = {
    id: clean(value.id) || makeId(),
    group: GROUPS.includes(value.group) ? value.group : GROUPS[5],
    gameId: clean(value.gameId),
    lineName: clean(value.lineName),
    team: clean(value.team),
    accountType: value.accountType === 'alt' ? 'alt' : 'main'
  };
  if (!record.gameId && !record.lineName) return { error: '遊戲 ID 或 LINE 名稱至少填寫一項。' };
  if (record.gameId.length > 100 || record.lineName.length > 100 || record.team.length > 100) {
    return { error: '單一欄位不可超過 100 字。' };
  }
  return { record };
}

export function duplicateGame(records, gameId, ignoreId = null) {
  if (!clean(gameId)) return null;
  return records.find((r) => r.id !== ignoreId && normalizeId(r.gameId) === normalizeId(gameId)) || null;
}

export function parseCsv(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '');
  const first = source.split(/\r?\n/).find((line) => line.trim()) || '';
  const delimiter = first.includes('\t') ? '\t' : first.includes(';') && !first.includes(',') ? ';' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell); cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => String(value).trim())) rows.push(row);
      row = []; cell = '';
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error('CSV 引號格式不完整。');
  row.push(cell);
  if (row.some((value) => String(value).trim())) rows.push(row);
  return rows;
}

const aliases = {
  gameId: ['遊戲id', '遊戲名稱', '遊戲帳號', 'gameid', 'game', '角色名稱'],
  lineName: ['line名稱', 'line名字', 'lineid', 'line', 'line暱稱'],
  team: ['隊伍', '小隊', '分隊', 'team'],
  accountType: ['帳號類型', '主號小號', '主小號', '類型', 'accounttype']
};
const normalizeHeader = (value) => clean(value).toLowerCase().replace(/[\s_（）()：:/-]/g, '');

export function mapImportRows(rows) {
  if (!Array.isArray(rows)) return [];
  const first = rows.find((row) => Array.isArray(row) && row.some((cell) => clean(cell))) || [];
  const header = first.map(normalizeHeader);
  const indices = Object.fromEntries(
    Object.entries(aliases).map(([field, values]) => [
      field,
      header.findIndex((cell) => values.includes(cell))
    ])
  );
  const hasHeader = indices.gameId >= 0 || indices.lineName >= 0 || indices.team >= 0;
  const firstRowIndex = rows.indexOf(first);
  const index = (field, fallback) => hasHeader ? indices[field] : fallback;
  return rows.slice(hasHeader ? firstRowIndex + 1 : firstRowIndex).map((row, offset) => {
    const get = (field, fallback) => {
      const i = index(field, fallback);
      return i < 0 ? '' : clean(row?.[i]);
    };
    const rawType = get('accountType', 3).toLowerCase();
    return {
      rowNumber: (hasHeader ? firstRowIndex + 2 : firstRowIndex + 1) + offset,
      gameId: get('gameId', 0),
      lineName: get('lineName', 1),
      team: get('team', 2),
      accountType: /^(小號|分身|alt|secondary|2)$/.test(rawType) ? 'alt' : 'main'
    };
  }).filter((row) => row.gameId || row.lineName || row.team);
}

export function prepareImport(records, sourceRows, group, strategy = 'skip') {
  const uploadIds = new Set();
  const entries = mapImportRows(sourceRows).map((raw) => {
    const check = validateMember({ ...raw, group });
    if (check.error) return { ...raw, action: 'invalid', reason: check.error };
    const key = normalizeId(check.record.gameId);
    if (key && uploadIds.has(key)) return { ...raw, action: 'invalid', reason: '檔案內遊戲 ID 重複' };
    if (key) uploadIds.add(key);
    const current = duplicateGame(records, raw.gameId);
    return { ...raw, action: current ? (strategy === 'replace' ? 'update' : 'skip') : 'add', existingId: current?.id ?? null, existingGroup: current?.group ?? null };
  });
  return {
    entries,
    added: entries.filter((row) => row.action === 'add').length,
    updated: entries.filter((row) => row.action === 'update').length,
    skipped: entries.filter((row) => row.action === 'skip').length,
    invalid: entries.filter((row) => row.action === 'invalid').length
  };
}

export function applyPreparedImport(records, preview, group) {
  const result = records.map((r) => ({ ...r }));
  for (const entry of preview.entries) {
    if (entry.action !== 'add' && entry.action !== 'update') continue;
    const validated = validateMember({ ...entry, id: entry.action === 'update' ? entry.existingId : '', group });
    if (!validated.record) continue;
    if (entry.action === 'update') {
      const position = result.findIndex((r) => r.id === entry.existingId);
      if (position >= 0) result[position] = validated.record;
    } else {
      result.push(validated.record);
    }
  }
  return result;
}

export function recordsToCsv(records) {
  const safeCell = (value) => {
    let text = clean(value);
    // Prevent spreadsheet formula execution when a name begins with a formula prefix.
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return '\uFEFF' + [
    ['遊戲 ID', 'LINE 名稱', '隊伍', '帳號類型'],
    ...records.map((row) => [row.gameId, row.lineName, row.team, row.accountType === 'alt' ? '小號' : '主號'])
  ].map((row) => row.map(safeCell).join(',')).join('\r\n');
}

export function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
