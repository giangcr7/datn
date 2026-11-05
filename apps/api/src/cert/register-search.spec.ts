import 'reflect-metadata';
import {
  normalizeRegisterSearch,
  registerSearchPlan,
  searchPattern,
} from './register-search';
import { registerQuery, registerSuggestionsQuery } from './diploma-register';
import { RegisterQueryDto } from './register-query.dto';

describe('register quick search', () => {
  it.each([
    ['  ĐẶNG\tThị\nÁnh  ', 'dang thi anh'],
    ['Nguyễn Văn An'.normalize('NFD'), 'nguyen van an'],
    ['  0012/VB-A  ', '0012/vb-a'],
    ['', ''],
  ])(
    'normalizes %p without changing identifier punctuation',
    (input, expected) => {
      expect(normalizeRegisterSearch(input)).toBe(expected);
    },
  );

  it('builds reordered tokens and conservative fuzzy-name matching', () => {
    expect(registerSearchPlan('Ánh Đặng')).toEqual({
      text: 'anh dang',
      tokens: ['anh', 'dang'],
      fuzzy: true,
    });
    for (const query of [
      'An',
      '001234',
      'Nguyen 123',
      'VB-01',
      '50%',
      'a'.repeat(81),
    ])
      expect(registerSearchPlan(query).fuzzy).toBe(false);
    expect(searchPattern('50%_\\')).toBe('50\\%\\_\\\\');
  });

  it('limits and scopes suggestions using latest committed snapshots', () => {
    const input = Object.assign(new RegisterQueryDto(), {
      search: 'Đặng 00123',
      limit: 100,
      page: 99,
      year: 2024,
      status: 'REVOKED',
    });
    const query = registerSuggestionsQuery('institution1', input);
    expect(query.text).toContain('LIMIT 6');
    expect(query.text).not.toContain('OFFSET');
    expect(query.text).not.toContain('COUNT(*)');
    expect(query.text).toContain('search_versions AS MATERIALIZED');
    expect(query.text).toContain('owner.institution_id');
    expect(query.text).toContain('newer.version > version.version');
    expect(query.text).toContain(
      "anchor.event_type = 'ISSUE' AND anchor.status = 'COMMITTED'",
    );
    expect(query.values).toEqual(
      expect.arrayContaining([
        'institution1',
        '%dang%',
        '%00123%',
        '2024',
        'REVOKED',
      ]),
    );
    expect(query.text).not.toContain('OPERATOR(public.%>)');
    expect(query.text).toContain(
      'ORDER BY search_rank, search_similarity DESC',
    );
  });

  it('does not prefilter an empty search and retains stable pagination', () => {
    const query = registerQuery('institution1', new RegisterQueryDto());
    expect(query.text).not.toContain('search_versions');
    expect(query.text).toContain('created_at DESC, id DESC');
    expect(query.text).toContain('OFFSET');
  });
});
