import { GROUPS, makeId, normalizeId } from './data.js';

export const LINE_ROSTER_KEY = 'guild-member-manager:line-roster:v1';
const trim = value => String(value ?? '').trim();
const header = value => trim(value).toLowerCase().replace(/[\s_（）()：:\/-]/g, '');
const hasHeader = (value, aliases) => aliases.includes(header(value));
const groupAliases = new Map([
  ...GROUPS.slice(0, 5).flatMap((group, i) => {
    const digit = String(i + 1);
    const numeral = ['一', '二', '三', '四', '五'][i];
    return [group, digit + '團', '第' + digit + '團', '第' + numeral + '團', digit, numeral, 'group' + digit]
      .map(alias => [header(alias), group]);
  }),
  ...['無遊戲團', '無團', '未分團', '待分團', '未入團', 'none', 'free', 'freeagent'].map(alias => [header(alias), GROUPS[5]])
]);

export function resolveGroup(value) {
  return groupAliases.get(header(value)) || null;
}

const gameHeaders = {
  group: ['團別', '遊戲團', '遊戲團別', '公會', '分團', 'group', 'guild'],
  gameId: ['遊戲id', '遊戲名稱', '遊戲帳號', '角色名稱', '角色id', 'gameid', 'game', '角色'],
  team: ['隊伍', '小隊', '分隊', 'team'],
  lineName: ['line名稱', 'line名字', 'lineid', 'line暱稱', 'line', 'line顯示名稱'],
  accountType: ['帳號類型', '主小號', '主號小號', '類型', 'accounttype']
};
const lineHeaders = ['line名稱', 'line名字', 'lineid', 'line暱稱', 'line', 'line顯示名稱', '名稱', '暱稱'];

export function prepareLineImport(rows) {
  if (!Array.isArray(rows) || !rows.length) return { names: [], duplicates: 0, invalid: 0, sourceCount: 0 };
  const first = rows.findIndex(row => Array.isArray(row) && row.some(cell => trim(cell)));
  if (first < 0) return { names: [], duplicates: 0, invalid: 0, sourceCount: 0 };
  const titleIndex = rows[first].findIndex(cell => hasHeader(cell, lineHeaders));
  const col = titleIndex >= 0 ? titleIndex : 0;
  const start = titleIndex >= 0 ? first + 1 : first;
  const seen = new Set(), names = [];
  let duplicates = 0, invalid = 0, sourceCount = 0;
  for (const row of rows.slice(start)) {
    if (!Array.isArray(row) || !row.some(cell => trim(cell))) continue;
    sourceCount++;
    const name = trim(row[col]);
    if (!name || name.length > 100) { invalid++; continue; }
    const key = normalizeId(name);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    names.push(name);
  }
  return { names, duplicates, invalid, sourceCount };
}

export function prepareGameImport(records, sheets) {
  const entries = [], seen = new Set();
  const existingByGame = new Map(records.filter(row => trim(row.gameId))
    .map(row => [normalizeId(row.gameId), row]));
  for (const sheet of sheets) {
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    const sheetGroup = resolveGroup(sheet.name);
    const firstIndex = rows.findIndex(row => Array.isArray(row) && row.some(cell => trim(cell)));
    if (firstIndex < 0) continue;
    const names = rows[firstIndex].map(header);
    const indices = Object.fromEntries(
      Object.entries(gameHeaders).map(([key, aliases]) => [key, names.findIndex(name => aliases.includes(name))])
    );
    const titled = indices.gameId >= 0 || indices.group >= 0;
    const column = (row, key, defaultIndex) => {
      const index = titled ? indices[key] : defaultIndex;
      return index >= 0 ? trim(row[index]) : '';
    };
    const start = titled ? firstIndex + 1 : firstIndex;
    for (let i = start; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || !row.some(cell => trim(cell))) continue;
      const rawGroup = column(row, 'group', sheetGroup ? -1 : 0);
      const group = resolveGroup(rawGroup) || (rawGroup ? null : sheetGroup);
      const gameId = column(row, 'gameId', sheetGroup ? 0 : 1);
      const team = column(row, 'team', sheetGroup ? 1 : 2);
      const lineName = column(row, 'lineName', sheetGroup ? 2 : 3);
      const typeText = column(row, 'accountType', sheetGroup ? 3 : 4);
      const accountType = /^(小號|分身|alt|secondary|2)$/i.test(typeText) ? 'alt' :
        /^(主號|main|primary|1)$/i.test(typeText) ? 'main' : null;
      const item = { sheet: sheet.name || '名單', rowNumber: i + 1, group, gameId, team, lineName, accountType };
      const key = normalizeId(gameId);
      if (!group) { entries.push({ ...item, action: 'invalid', reason: '未填團別或團別無效' }); continue; }
      if (!gameId || gameId.length > 100 || team.length > 100 || lineName.length > 100) {
        entries.push({ ...item, action: 'invalid', reason: '遊戲 ID 必填且欄位不可超過 100 字' });
        continue;
      }
      if (seen.has(key)) { entries.push({ ...item, action: 'invalid', reason: '此檔案內遊戲 ID 重複' }); continue; }
      seen.add(key);
      const existing = existingByGame.get(key);
      entries.push({ ...item,
        action: existing ? 'update' : 'add',
        existingId: existing?.id ?? null,
        warning: existing?.lineName && lineName && normalizeId(existing.lineName) !== normalizeId(lineName)
          ? '已保留原本人工 LINE 配對' : ''
      });
    }
  }
  return {
    entries,
    added: entries.filter(e => e.action === 'add').length,
    updated: entries.filter(e => e.action === 'update').length,
    invalid: entries.filter(e => e.action === 'invalid').length
  };
}

export function applyGameImport(records, preview) {
  const result = records.map(record => ({ ...record }));
  for (const item of preview.entries) {
    if (!['add', 'update'].includes(item.action)) continue;
    if (item.action === 'add') {
      result.push({ id: makeId(), group: item.group, gameId: item.gameId,
        team: item.team, lineName: item.lineName, accountType: item.accountType || 'main' });
    } else {
      const pos = result.findIndex(record => record.id === item.existingId);
      if (pos < 0) continue;
      const existing = result[pos];
      result[pos] = { ...existing, group: item.group,
        gameId: existing.gameId, team: item.team || existing.team,
        lineName: existing.lineName || item.lineName,
        accountType: item.accountType || existing.accountType
      };
    }
  }
  return result;
}

export function compareRosters(records, lineRoster) {
  const lineNames = Array.isArray(lineRoster) ? lineRoster : [];
  const lineSet = new Set(lineNames.map(normalizeId));
  const gameRecords = records.filter(record => Boolean(trim(record.gameId)));
  const linkedLines = new Set(gameRecords.filter(record => trim(record.lineName)).map(record => normalizeId(record.lineName)));
  const lineOnly = lineNames.filter(name => !linkedLines.has(normalizeId(name)));
  const gameMissingLine = gameRecords.filter(record =>
    !trim(record.lineName) || (lineNames.length > 0 && !lineSet.has(normalizeId(record.lineName)))
  );
  const matched = gameRecords.filter(record =>
    trim(record.lineName) && (lineNames.length === 0 || lineSet.has(normalizeId(record.lineName)))
  );
  return { lineOnly, gameMissingLine, matched, hasImportedLine: lineNames.length > 0 };
}

export function normalizeLineRoster(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map(trim).filter(name => {
    if (!name || name.length > 100) return false;
    const key = normalizeId(name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
