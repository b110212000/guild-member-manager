import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS } from '../src/data.js';
import { resolveGroup, prepareLineImport, prepareGameImport, applyGameImport, compareRosters, normalizeLineRoster } from '../src/rosterImport.js';

test('one LINE file is deduplicated and accepts display-name headers', () => {
  const preview = prepareLineImport([['LINE 名稱'], ['小明'], ['小明'], ['美美'], ['']]);
  assert.deepEqual(preview.names, ['小明','美美']);
  assert.equal(preview.duplicates,1);
  assert.deepEqual(normalizeLineRoster(['小明',' 小明 ','美美']), ['小明','美美']);
});

test('game group names support all five group styles and ungrouped', () => {
  assert.equal(resolveGroup('1團'),GROUPS[0]);
  assert.equal(resolveGroup('第2團'),GROUPS[1]);
  assert.equal(resolveGroup('第三團'),GROUPS[2]);
  assert.equal(resolveGroup('五團'),GROUPS[4]);
  assert.equal(resolveGroup('無遊戲團'),GROUPS[5]);
  assert.equal(resolveGroup('未知群組'),null);
});

test('one combined game CSV imports into multiple group tabs', () => {
  const data=[{name:'整合名單',rows:[
    ['團別','遊戲 ID','隊伍','LINE 名稱','帳號類型'],
    ['第一團','星夜','A隊','小明','主號'],
    ['第二團','星夜分身','B隊','小明','小號'],
    ['第五團','月亮','C隊','','主號'],
    ['第四團','星夜','D隊','','主號']
  ]}];
  const preview=prepareGameImport([],data);
  assert.equal(preview.added,3);
  assert.equal(preview.invalid,1);
  const rows=applyGameImport([],preview);
  assert.equal(rows.length,3);
  assert.equal(rows.find(row=>row.gameId==='星夜分身').accountType,'alt');
  assert.equal(rows.find(row=>row.gameId==='月亮').group,'第五團');
});

test('one Excel workbook with five named sheets can import game IDs', () => {
  const sheets=GROUPS.slice(0,5).map((name,i)=>({
    name,
    rows:[['遊戲 ID','隊伍','帳號類型'],['PLAYER'+(i+1),'A隊',i%2?'小號':'主號']]
  }));
  const preview=prepareGameImport([],sheets);
  assert.equal(preview.added,5);
  assert.deepEqual(preview.entries.map(item=>item.group),GROUPS.slice(0,5));
});

test('re-import updates team and group without breaking manual LINE pairing', () => {
  const old=[{id:'abc',group:'第一團',gameId:'Knight',lineName:'老朋友',team:'A隊',accountType:'main'}];
  const preview=prepareGameImport(old,[{name:'整合名單',rows:[
    ['團別','遊戲 ID','隊伍','LINE 名稱','帳號類型'],
    ['第二團','Knight','B隊','陌生人','主號']
  ]}]);
  assert.equal(preview.updated,1);
  assert.ok(preview.entries[0].warning);
  const next=applyGameImport(old,preview);
  assert.equal(next.length,1);
  assert.equal(next[0].id,'abc');
  assert.equal(next[0].group,'第二團');
  assert.equal(next[0].team,'B隊');
  assert.equal(next[0].lineName,'老朋友');
});

test('LINE-only and game-only are compared using explicit links, not guessed from game IDs', () => {
  const records=[
    {gameId:'小明',lineName:'',group:'第一團'},
    {gameId:'Knight',lineName:'美美',group:'第二團'},
    {gameId:'AltKnight',lineName:'美美',group:'第三團'}
  ];
  const compare=compareRosters(records,['小明','美美','阿哲']);
  assert.deepEqual(compare.lineOnly,['小明','阿哲']);
  assert.deepEqual(compare.gameMissingLine.map(r=>r.gameId),['小明']);
  assert.equal(compare.matched.length,2);
});

test('game import rejects missing group or missing game ID', () => {
  const input=[{name:'整合名單',rows:[
    ['團別','遊戲 ID','隊伍'],
    ['第六團','No','A隊'],
    ['第一團','','B隊']
  ]}];
  const result=prepareGameImport([],input);
  assert.equal(result.invalid,2);
  assert.equal(result.added,0);
});
