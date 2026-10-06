import { describe, expect, it } from 'vitest'
import {
  cleanTitle,
  comparePicks,
  competitionLabel,
  daysLeft,
  matchScore,
  parseDeadline,
  reqMatchText,
  sectionOf
} from './derive'
import type { Posting, Score } from './types'
// Every distinct scored row from the old workbook, with the value update_workbook.py's match10 gave it.
import fixtures from './match-fixtures.json'

describe('matchScore', () => {
  it('matches update_workbook.py match10 on every workbook row', () => {
    for (const c of fixtures as {
      score: Score
      applicants: number | null
      expected: number | null
    }[]) {
      expect(matchScore(c.score, c.applicants), JSON.stringify(c)).toBe(c.expected)
    }
  })

  it('is null without a score or requirement counts', () => {
    expect(matchScore(undefined, 5)).toBeNull()
    expect(matchScore({ section: 'near', fit: 4 }, 5)).toBeNull()
  })
})

describe('parsing', () => {
  it('cleans SCOPE titles', () => {
    expect(cleanTitle('W27 Intern, Developer (Winter 2027) 185295B')).toBe(
      'Intern, Developer (Winter 2027)'
    )
    expect(cleanTitle('S27 Software Development Internship (Summer 2027) 185274B')).toBe(
      'Software Development Internship (Summer 2027)'
    )
    expect(cleanTitle('W27 Data Analyst 1852951 E1')).toBe('Data Analyst')
    expect(cleanTitle('Research Assistant')).toBe('Research Assistant')
  })

  it('parses SCOPE deadlines as Pacific wall-clock time', () => {
    expect(parseDeadline('Oct 9, 2026 09:00 AM')).toBe('2026-10-09T09:00')
    expect(parseDeadline('Oct 12, 2026 11:59 PM')).toBe('2026-10-12T23:59')
    expect(parseDeadline('Jan 1, 2027 12:30 AM')).toBe('2027-01-01T00:30')
    expect(parseDeadline('Dec 3, 2026 12:00 PM')).toBe('2026-12-03T12:00')
    expect(parseDeadline('')).toBeNull()
    expect(parseDeadline('Rolling')).toBeNull()
  })

  it('counts days left like the workbook', () => {
    expect(daysLeft('2026-10-09T09:00', new Date('2026-10-08T09:00'))).toBe(1)
    expect(daysLeft('2026-10-09T09:00', new Date('2026-10-10T09:00'))).toBe(-1)
    expect(daysLeft(null)).toBeNull()
  })
})

describe('labels', () => {
  it('describes competition and requirement counts', () => {
    expect(competitionLabel(null)).toBe('')
    expect(competitionLabel(9)).toBe('Low')
    expect(competitionLabel(10)).toBe('Medium')
    expect(competitionLabel(30)).toBe('High')
    expect(competitionLabel(60)).toBe('Very high')
    expect(
      reqMatchText({
        section: 'pick',
        requiredMet: 2.5,
        requiredTotal: 4,
        preferredMet: 1,
        preferredTotal: 2
      })
    ).toBe('2.5/4 req, 1/2 pref')
    expect(
      reqMatchText({ section: 'pick', requiredMet: 3, requiredTotal: 3, preferredTotal: 0 })
    ).toBe('3/3 req')
  })
})

describe('comparePicks', () => {
  const make = (
    id: string,
    fit: number,
    deadline: string,
    myStatus: Posting['myStatus'] = ''
  ): Posting => ({
    id,
    term: 'W27',
    listing: {
      title: id,
      org: 'o',
      location: 'l',
      deadlineText: '',
      deadline,
      applicants: 0,
      appStatus: '-'
    },
    firstSeen: '2026-10-01T00:00:00.000Z',
    lastSeen: '2026-10-01T00:00:00.000Z',
    onScopeNow: true,
    myStatus,
    score: { section: 'pick', fit, requiredMet: 2, requiredTotal: 2, preferredTotal: 0 }
  })

  it('ranks open postings by match, then closed ones, then skipped ones', () => {
    const now = new Date('2026-10-04T12:00')
    const rows = [
      make('closed-5', 5, '2026-09-24T09:00'),
      make('open-3', 3, '2026-10-09T09:00'),
      make('skip-5', 5, '2026-10-09T09:00', 'Skip'),
      make('open-5-later', 5, '2026-10-20T09:00'),
      make('open-5-soon', 5, '2026-10-06T09:00')
    ]
    expect(rows.sort((a, b) => comparePicks(a, b, now)).map((p) => p.id)).toEqual([
      'open-5-soon',
      'open-5-later',
      'open-3',
      'closed-5',
      'skip-5'
    ])
  })
})

describe('sectionOf', () => {
  const base: Posting = {
    id: '1',
    term: 'W27',
    listing: {
      title: 't',
      org: 'o',
      location: 'l',
      deadlineText: '',
      deadline: null,
      applicants: 0,
      appStatus: '-'
    },
    firstSeen: '2026-10-01T00:00:00.000Z',
    lastSeen: '2026-10-01T00:00:00.000Z',
    onScopeNow: true,
    myStatus: ''
  }

  it('puts applied or drafting postings in progress before anything else', () => {
    expect(sectionOf({ ...base, score: { section: 'pick' } })).toBe('pick')
    expect(sectionOf({ ...base, score: { section: 'pick' }, myStatus: 'Drafting' })).toBe('inprog')
    expect(
      sectionOf({
        ...base,
        listing: { ...base.listing, appStatus: "Applied via employer's website" }
      })
    ).toBe('inprog')
    expect(sectionOf(base)).toBe('unread')
    expect(sectionOf({ ...base, score: { section: 'near' }, myStatus: 'Skip' })).toBe('near')
  })
})
