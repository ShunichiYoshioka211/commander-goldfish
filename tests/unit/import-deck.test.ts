import { describe, expect, it } from 'vitest';
import { deckRows, parseCsv } from '../../scripts/lib/deck-csv';
import { jaDraft, toCardDef, type ScryfallCard } from '../../scripts/lib/scryfall';

const JA = { type: 'タイプ', text: '効果', tip: 'コツ' };

describe('CSV の読み込み', () => {
  it('引用符・カンマ・改行・CRLF を扱う', () => {
    expect(parseCsv('a,"b,c","d ""e"""\r\n1,2,3')).toEqual([
      ['a', 'b,c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });

  it('投入済みの行だけを英語名で数える', () => {
    const csv = [
      '﻿投入済み,和名,英語名,マナコスト（色）,マナコスト（数値）,カード種別,メイン効果,サブ効果,備考,所持数',
      'TRUE,山,Mountain,,0,土地,,,,',
      'TRUE,山,Mountain,,0,土地,,,,',
      'FALSE,冒涜の行動,Blasphemous Act,{R} 赤,9,ソーサリー,全体除去,,,',
      'TRUE,,Ingris Stingerquill,{B}{R} 黒赤,3,クリーチャー,バーン,,"統率者 / 飛行",',
      'TRUE,,,,,,,,,',
    ].join('\n');
    expect(deckRows(csv)).toEqual([
      { name: 'Mountain', jaName: '山', count: 2 },
      { name: 'Ingris Stingerquill', jaName: '', count: 1 },
    ]);
  });

  it('all=true ならレシピの全行を数える', () => {
    const csv = ['投入済み,和名,英語名,備考', 'TRUE,山,Mountain,', 'FALSE,山,Mountain,', 'FALSE,太陽の指輪,Sol Ring,'].join('\n');
    expect(deckRows(csv, true).map((r) => [r.name, r.count])).toEqual([
      ['Mountain', 2],
      ['Sol Ring', 1],
    ]);
  });

  it('列が足りなければ止まる', () => {
    expect(() => deckRows('和名,英語名\n山,Mountain')).toThrow('投入済み');
  });
});

describe('Scryfall からの変換', () => {
  const base: ScryfallCard = {
    name: 'Torbran, Thane of Red Fell',
    mana_cost: '{1}{R}{R}{R}',
    cmc: 4,
    type_line: 'Legendary Creature — Dwarf Noble',
    oracle_text: 'text',
    power: '2',
    toughness: '4',
    colors: ['R'],
    color_identity: ['R'],
    keywords: [],
    image_uris: { small: 's', normal: 'n' },
  };

  it('普通のカード', () => {
    expect(toCardDef(base, { jaName: '朱地洞の族長、トーブラン', count: 1 }, JA)).toMatchObject({
      jaName: '朱地洞の族長、トーブラン',
      typeJa: 'タイプ',
      textJa: '効果',
      tip: 'コツ',
      power: 2,
      toughness: 4,
      image: { small: 's', normal: 'n' },
    });
  });

  it('日本語版の印刷があればその画像を使う（small と normal だけ）', () => {
    const printed = { ...base, lang: 'ja', image_uris: { small: 'js', normal: 'jn', large: 'jl' } as never };
    expect(toCardDef(base, { jaName: '', count: 1 }, JA, printed).image).toEqual({ small: 'js', normal: 'jn' });
  });

  it('和名が無ければ英語名、P/T が * なら 0', () => {
    const def = toCardDef({ ...base, power: '*', toughness: undefined, colors: undefined }, { jaName: '', count: 1 }, JA);
    expect(def).toMatchObject({ jaName: base.name, power: 0, toughness: null, colors: ['R'] });
  });

  it('両面・分割カードは面ごとの文章をつなぐ', () => {
    const def = toCardDef(
      {
        ...base,
        name: 'A // B',
        mana_cost: undefined,
        type_line: undefined,
        oracle_text: undefined,
        power: undefined,
        toughness: undefined,
        image_uris: undefined,
        card_faces: [
          { name: 'A', mana_cost: '{3}{R}', type_line: 'Enchantment — Room', oracle_text: 'a', image_uris: { small: 'fs', normal: 'fn' } },
          { name: 'B', mana_cost: '{3}{R}', type_line: 'Enchantment — Room' },
        ],
      },
      { jaName: '', count: 1 },
      { ...JA, name: 'A // B（和名）' },
    );
    expect(def).toMatchObject({ jaName: 'A // B（和名）', manaCost: '{3}{R} // {3}{R}', typeLine: 'Enchantment — Room', oracle: '【A】a\n【B】', image: { small: 'fs', normal: 'fn' } });
  });
});

describe('日本語の下書き', () => {
  const card = { name: 'X', cmc: 1, color_identity: [], keywords: [], type_line: 'Creature — Elf', oracle_text: 'Flying' } as ScryfallCard;

  it('日本語版の印刷から、ふりがなを除いて作る', () => {
    const printed = { ...card, printed_type_line: 'クリーチャー — エルフ', printed_text: '飛（ひ）行（こう）' };
    expect(jaDraft(card, printed)).toEqual({ type: 'クリーチャー — エルフ', text: '飛行', tip: '' });
  });

  it('両面は面ごとに見出しを付ける', () => {
    const printed = {
      ...card,
      card_faces: [
        { name: 'A', printed_name: 'エー', printed_type_line: '部屋', printed_text: 'あ' },
        { name: 'B', printed_type_line: '部屋' },
      ],
    };
    expect(jaDraft(card, printed)).toEqual({ type: '部屋 // 部屋', text: '【エー】あ\n【B】', tip: '' });
  });

  it('日本語版が無ければ英語のまま', () => {
    expect(jaDraft(card, undefined)).toEqual({ type: 'Creature — Elf', text: 'Flying', tip: '' });
  });
});

describe('新しいデッキの雛形', async () => {
  const { isDeckId, newDeckFiles } = await import('../../scripts/lib/new-deck');

  it('ID は ASCII の kebab-case だけ', () => {
    expect(isDeckId('krenko-goblins')).toBe(true);
    expect(isDeckId('Krenko')).toBe(false);
    expect(isDeckId('クレンコ')).toBe(false);
    expect(() => newDeckFiles('bad id', 'x', ['A'])).toThrow('kebab-case');
  });

  it('config・CSV（統率者の行だけ）・空の ja.json を作り、CSV は取り込みで読める', () => {
    const files = newDeckFiles('pair', '共闘', ['Francisco, Fowl Marauder', 'Say "Hi"']);
    expect(JSON.parse(files['config.json'])).toEqual({
      name: '共闘',
      csv: 'cards.csv',
      commanders: ['Francisco, Fowl Marauder', 'Say "Hi"'],
      include: 'all',
    });
    expect(deckRows(files['cards.csv'], true).map((r) => r.name)).toEqual(['Francisco, Fowl Marauder', 'Say "Hi"']);
    expect(files['ja.json']).toBe('{}\n');
  });
});
