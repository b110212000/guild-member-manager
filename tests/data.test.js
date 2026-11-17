import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS, parseCsv, mapImportRows, duplicateGame, prepareImport, applyPreparedImport, validateMember, recordsToCsv } from '../src/data.js';

test('six group tabs exist', () => {
  assert.deepEqual(GROUPS, ['第一團', '第二團', '第三團', '第四團', '第五團', '無遊戲團']);
});

test('CSV quoted commas and newlines are parsed', () => {
  assert.deepEqual(parseCsv('遊戲 ID,LINE 名稱,隊伍\r\n"玩家,一","小\n明",A隊'), [
    ['遊戲 ID', 'LINE 名稱', '隊伍'], ['玩家,一', '小\n明', 'A隊']
  ]);
});

test('import matches column headers even in different order', () => {
  const rows = mapImportRows([['LINE 名稱', '隊伍', '遊戲 ID'], ['小明', 'A隊', 'Knight']]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].gameId, 'Knight');
  assert.equal(rows[0].lineName, '小明');
});

test('one person can have multiple game IDs', () => {
  const a = validateMember({ group: '第一團', gameId: 'Knight', lineName: '小明' }).record;
  const b = validateMember({ group: '第二團', gameId: 'Knight2', lineName: '小明', accountType: 'alt' }).record;
  assert.notEqual(a.gameId, b.gameId);
  assert.equal(b.accountType, 'alt');
  assert.equal(duplicateGame([a], b.gameId), null);
});

test('duplicate game IDs are detected across groups, case-insensitively', () => {
  const records = [{ id: '1', gameId: 'Knight', group: '第一團' }];
  assert.equal(duplicateGame(records, ' knight ').id, '1');
});

test('import can skip duplicate or replace and move group', () => {
  const current = [{ id: 'existing', group: '第一團', gameId: 'Knight', lineName: '小明', team: 'A隊', accountType: 'main' }];
  const rows = [['遊戲 ID', 'LINE 名稱', '隊伍'], ['knight', '小明', 'B隊'], ['New', '美美', 'C隊']];
  const skip = prepareImport(current, rows, '第二團');
  assert.equal(skip.added, 1);
  assert.equal(skip.skipped, 1);
  const replace = prepareImport(current, rows, '第二團', 'replace');
  assert.equal(replace.updated, 1);
  const applied = applyPreparedImport(current, replace, '第二團');
  assert.equal(applied.length, 2);
  assert.equal(applied.find((r) => r.id === 'existing').group, '第二團');
  assert.equal(applied.find((r) => r.id === 'existing').team, 'B隊');
});

test('empty identities are rejected', () => {
  assert.ok(validateMember({ group: '無遊戲團', gameId: '', lineName: '' }).error);
  assert.ok(validateMember({ group: '無遊戲團', gameId: '', lineName: '小花' }).record);
});

test('CSV export protects Excel from formula injection', () => {
  const csv = recordsToCsv([{ gameId: '=HYPERLINK(1)', lineName: '明', team: '', accountType: 'main' }]);
  assert.ok(csv.includes("'=HYPERLINK(1)"));
});
