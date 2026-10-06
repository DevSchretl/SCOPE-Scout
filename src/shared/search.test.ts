import { describe, expect, it } from 'vitest'
import {
  countValues,
  formatQuery,
  fromForm,
  isEmptyQuery,
  markRanges,
  marksFor,
  matchesText,
  parseQuery,
  searchPostings,
  snippetOf,
  suggestValues,
  toForm,
  type SearchOptions
} from './search'
import { foldWithMap } from './text'
import type { Posting } from './types'

function make(
  id: string,
  listing: Partial<Posting['listing']> = {},
  change: Partial<Posting> = {}
): Posting {
  return {
    id,
    term: 'W27',
    listing: {
      title: 't',
      org: 'o',
      location: 'l',
      deadlineText: '',
      deadline: '2026-10-20T09:00',
      applicants: 5,
      appStatus: '-',
      ...listing
    },
    firstSeen: '2026-10-01T00:00:00.000Z',
    lastSeen: '2026-10-05T00:00:00.000Z',
    onScopeNow: true,
    myStatus: '',
    ...change
  }
}

const word = (text: string, field?: string): object =>
  field ? { text, quoted: false, field } : { text, quoted: false }

describe('parseQuery', () => {
  it('reads words, phrases, exclusions and OR groups', () => {
    expect(parseQuery('data "machine learning" -senior react OR vue')).toEqual({
      all: [word('data'), { text: 'machine learning', quoted: true }],
      any: [[word('react'), word('vue')]],
      none: [word('senior')],
      scope: []
    })
  })

  it('reads field prefixes, quoted values, aliases and in:', () => {
    expect(parseQuery('org:"Capital One" location:toronto title:intern in:title,org,nope')).toEqual(
      {
        all: [
          { text: 'Capital One', quoted: true, field: 'org' },
          word('toronto', 'city'),
          word('intern', 'title')
        ],
        any: [],
        none: [],
        scope: ['title', 'org']
      }
    )
  })

  it('keeps unknown prefixes, stray ORs and open quotes as plain text', () => {
    expect(parseQuery('OR c++ http://x.com a OR').all).toEqual([
      word('c++'),
      word('http://x.com'),
      word('a')
    ])
    expect(parseQuery('"machine learn').all).toEqual([{ text: 'machine learn', quoted: false }])
    expect(parseQuery('(python OR java) -(senior)')).toEqual({
      all: [],
      any: [[word('python'), word('java')]],
      none: [word('senior')],
      scope: []
    })
    // An OR right after a left-out word joins nothing.
    expect(parseQuery('x -a OR b')).toEqual({
      all: [word('x'), word('b')],
      any: [],
      none: [word('a')],
      scope: []
    })
  })

  it('knows an empty query', () => {
    expect(isEmptyQuery(parseQuery('   '))).toBe(true)
    expect(isEmptyQuery(parseQuery('in:title'))).toBe(true)
    expect(isEmptyQuery(parseQuery('-senior'))).toBe(false)
  })
})

describe('formatQuery', () => {
  it('writes a query back in a standard order', () => {
    expect(
      formatQuery(parseQuery('-senior react OR vue org:"Capital One" in:title "machine learning"'))
    ).toBe('org:"Capital One" "machine learning" (react OR vue) -senior in:title')
  })

  it('round-trips', () => {
    for (const text of [
      'data analyst',
      '"machine learning" python',
      'org:"Capital One" (react OR vue) -senior in:title,desc',
      'id:183097',
      'city:vancouver -status:applied'
    ]) {
      expect(formatQuery(parseQuery(text))).toBe(text)
      expect(parseQuery(formatQuery(parseQuery(text)))).toEqual(parseQuery(text))
    }
  })
})

describe('advanced search form', () => {
  it('fills the boxes from a query and keeps what they cannot show', () => {
    const q = parseQuery(
      'python data "machine learning" (react OR vue) -senior org:shopify in:title,desc'
    )
    expect(toForm(q)).toEqual({
      all: 'python data',
      phrase: 'machine learning',
      any: 'react vue',
      none: 'senior',
      scope: ['title', 'desc']
    })
    const next = fromForm({ ...toForm(q), all: 'go', any: 'aws gcp azure', none: '' }, q)
    expect(formatQuery(next)).toBe(
      'go "machine learning" org:shopify (aws OR gcp OR azure) in:title,desc'
    )
  })

  it('treats a single "any" word as required', () => {
    const form = { all: '', phrase: '', any: 'python', none: '', scope: [] }
    expect(formatQuery(fromForm(form, parseQuery('')))).toBe('python')
  })
})

describe('searchPostings', () => {
  const now = new Date('2026-10-05T12:00')
  const ps = [
    make('183097', {
      title: 'Software Developer Intern',
      org: 'Capital One',
      location: 'Toronto, ON'
    }),
    make(
      '183100',
      { title: 'Data Analyst', org: 'Montréal Analytics', location: 'Montréal, QC' },
      {
        details: {
          'Job Description': 'Work with JavaScript and machine learning pipelines.',
          'Job Requirements': 'Python, SQL'
        }
      }
    ),
    make('183200', { title: 'Senior Developer', org: 'Shopify', location: 'Ottawa, ON' }),
    make('183300', {
      title: 'Developer',
      org: 'Old Co',
      location: 'Vancouver, BC',
      deadline: '2026-09-01T09:00'
    }),
    make(
      '183400',
      { title: 'Developer', org: 'Gone Inc', location: 'Victoria, BC' },
      {
        onScopeNow: false
      }
    )
  ]
  const ids = (q: string, options: SearchOptions = {}): string[] =>
    searchPostings(ps, parseQuery(q), { now, ...options }).results.map((r) => r.posting.id)

  it('matches the start of words, whatever the accents, with open postings first', () => {
    expect(ids('dev')).toEqual(['183097', '183200', '183300', '183400'])
    expect(ids('montreal')).toEqual(['183100'])
    expect(ids('java')).toEqual(['183100'])
    // Not from the middle of a word.
    expect(ids('script')).toEqual([])
  })

  it('handles phrases, exclusions, OR and fields', () => {
    expect(ids('"machine learning"')).toEqual(['183100'])
    expect(ids('"machine learn"')).toEqual([])
    expect(ids('developer -senior')).toEqual(['183097', '183300', '183400'])
    expect(ids('shopify OR montreal')).toEqual(['183100', '183200'])
    expect(ids('org:shopify')).toEqual(['183200'])
    expect(ids('city:bc')).toEqual(['183300', '183400'])
    expect(ids('title:capital')).toEqual([])
    expect(ids('in:org capital')).toEqual(['183097'])
    expect(ids('in:title capital')).toEqual([])
  })

  it('finds job IDs, putting an exact one first', () => {
    expect(ids('183097')[0]).toBe('183097')
    expect(ids('1831')).toEqual(['183100'])
  })

  it('ranks a better fit first when the text matches about as well', () => {
    const strong = make(
      'fit',
      { title: 'Developer' },
      {
        score: { section: 'pick', fit: 5, requiredMet: 2, requiredTotal: 2, preferredTotal: 0 }
      }
    )
    const wordy = make(
      'wordy',
      { title: 'Developer' },
      {
        details: { 'Job Description': 'A developer role for a developer.' }
      }
    )
    const order = searchPostings([wordy, strong], parseQuery('developer'), { now }).results
    expect(order.map((r) => r.posting.id)).toEqual(['fit', 'wordy'])
  })

  it('can leave out closed postings and ones gone from SCOPE', () => {
    const r = searchPostings(ps, parseQuery('developer'), {
      now,
      includeClosed: false,
      includeGone: false
    })
    expect(r.results.map((x) => x.posting.id)).toEqual(['183097', '183200'])
    expect(r.hidden).toBe(2)
  })

  it('matches everything for an empty query, sorted as asked', () => {
    const r = searchPostings(ps, parseQuery(''), { now, sort: 'org' })
    expect(r.results.map((x) => x.posting.listing.org)).toEqual([
      'Capital One',
      'Montréal Analytics',
      'Shopify',
      'Gone Inc',
      'Old Co'
    ])
  })

  it('backs the Keywords filter', () => {
    expect(matchesText(ps[1], 'python -senior')).toBe(true)
    expect(matchesText(ps[2], 'python')).toBe(false)
  })

  it('suggests organizations whose words start with what you typed', () => {
    const counts = countValues(ps, (p) => p.listing.org)
    expect(suggestValues(counts, parseQuery('cap'))).toEqual([{ value: 'Capital One', count: 1 }])
    expect(suggestValues(counts, parseQuery('org:cap'))).toEqual([])
  })
})

describe('highlights and snippets', () => {
  it('marks words in the original text, even when folding changes its length', () => {
    const text = 'Développeur™ in Montréal… today'
    const ranges = markRanges(text, marksFor(parseQuery('developpeur montreal')))
    expect(ranges.map(([s, e]) => text.slice(s, e))).toEqual(['Développeur', 'Montréal'])
    expect(foldWithMap('plain text').map).toBeNull()
  })

  it('marks quoted words only when whole', () => {
    expect(markRanges('dev developer', marksFor(parseQuery('"dev"')))).toEqual([[0, 3]])
    expect(markRanges('dev developer', marksFor(parseQuery('dev')))).toEqual([
      [0, 3],
      [4, 7]
    ])
  })

  it('cuts a snippet around the first match', () => {
    const p = make(
      '1',
      {},
      {
        details: {
          'Job Description': `${'Intro words here. '.repeat(20)}We use Kubernetes daily. ${'More text follows. '.repeat(20)}`
        }
      }
    )
    const s = snippetOf(p, marksFor(parseQuery('kubernetes')))
    expect(s.startsWith('...')).toBe(true)
    expect(s.endsWith('...')).toBe(true)
    expect(s).toContain('We use Kubernetes daily.')
    expect(s.length).toBeLessThanOrEqual(166)
    // No match in the text: the start of the description.
    expect(snippetOf(p, marksFor(parseQuery('zzz')))).toMatch(/^Intro words here\..*\.\.\.$/)
  })
})
