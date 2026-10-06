// Runs inside the SCOPE postings page (injected by scope.ts after every page load).
// Port of helper.js from the old scheduled task, minus the Claude-in-Chrome workarounds.
//
// READ-ONLY: this only clicks quick-search and pagination links and posts the job-title
// "view" form (np-view-btn). It never touches Apply, Shortlist, "I intend to apply" or
// Not Interested.
;(() => {
  const clean = (s) =>
    (s || '')
      .replace(/[ \t\u00a0]+/g, ' ')
      .replace(/\s*\n\s*/g, '\n')
      .trim()
  const oneLine = (s) => clean(s).replace(/\n+/g, ' ')
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const rows = () =>
    [...document.querySelectorAll('table tbody tr')].filter((r) => r.cells.length >= 10)

  // Only the job-title "view" link, never an Apply link.
  const viewParams = (r) => {
    const a = r.querySelector('a[class*="np-view-btn-"]')
    const oc = a ? a.getAttribute('onclick') || '' : ''
    if (!a || /apply/i.test(a.className) || !oc.includes('orbisAppSr.buildForm')) return null
    try {
      return JSON.parse(oc.match(/buildForm\((\{.*?\})/)[1].replace(/'/g, '"'))
    } catch {
      return null
    }
  }
  const firstId = () => {
    const r = rows()[0]
    const p = r && viewParams(r)
    return p && String(p.postingId)
  }

  async function fetchFields(params) {
    const jq = window.orbisAppSr.buildForm(params, '', '_BLANK') // adds the page's _csrf field
    const form = jq.get ? jq.get(0) : jq[0]
    const body = new URLSearchParams(new FormData(form)).toString()
    form.remove()
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 30000)
    let html
    try {
      const res = await fetch(location.pathname, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: ctrl.signal
      })
      html = await res.text()
    } finally {
      clearTimeout(timer)
    }
    const doc = new DOMParser().parseFromString(html, 'text/html')
    if (/Not Logged In/i.test(doc.title)) throw new Error('LOGGED_OUT')
    doc.querySelectorAll('script,style,noscript').forEach((n) => n.remove())
    doc.querySelectorAll('li').forEach((el) => el.prepend('- '))
    doc.querySelectorAll('br,p,div,li,h1,h2,h3,h4,h5,h6,tr,ul,ol').forEach((el) => el.append('\n'))
    const f = {}
    doc.querySelectorAll('table.table-bordered tr').forEach((tr) => {
      if (tr.cells.length < 2) return
      const k = oneLine(tr.cells[0].textContent).replace(/\s*:$/, '')
      const v = clean(tr.cells[1].textContent).replace(/^View Targeted Programs\n?/, '')
      if (k && v) f[k] = v
    })
    if (!f['Job Description'] && !f['Placement Term']) throw new Error('NO_FIELDS')
    return f
  }

  window.__scout = {
    isLoggedOut() {
      return /Not Logged In/i.test(document.title)
    },

    clickQuickSearch(name) {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
      const link = [...document.querySelectorAll('a')].find((a) => norm(a.innerText) === name)
      if (!link) return { ok: false }
      // The click reloads the page, so return first and click a moment later.
      setTimeout(() => link.click(), 50)
      return { ok: true }
    },

    activePage() {
      const li = document.querySelector('.pagination li.active')
      return li ? Number(li.innerText.trim()) || 1 : 1
    },

    /** One object per row: the columns helper.js read (c[1] app status ... c[9] deadline). */
    listRows() {
      return rows().map((r) => {
        const c = [...r.cells].map((td) => oneLine(td.innerText))
        const p = viewParams(r)
        return {
          id: p ? String(p.postingId) : c[3],
          title: c[4],
          org: c[5],
          location: c[7],
          applicants: c[8],
          deadline: c[9],
          appStatus: c[1] || '-',
          canRead: !!p
        }
      })
    },

    /** Paging is in-page (no reload); wait until the first row changes. */
    async goToPage(n) {
      const before = firstId()
      const link = [...document.querySelectorAll('.pagination a')].find(
        (a) => a.innerText.trim() === String(n)
      )
      if (!link) return { ok: false, reason: 'no page ' + n }
      link.click()
      for (let i = 0; i < 80; i++) {
        await sleep(250)
        if (firstId() && firstId() !== before) return { ok: true }
      }
      return { ok: false, reason: 'page ' + n + ' did not load' }
    },

    /** Reads one posting from the current results page through its view link. */
    async readPosting(id) {
      const row = rows().find((r) => {
        const p = viewParams(r)
        return p && String(p.postingId) === String(id)
      })
      if (!row) return { ok: false, error: 'NOT_ON_PAGE' }
      try {
        return { ok: true, fields: await fetchFields(viewParams(row)) }
      } catch (e) {
        return {
          ok: false,
          error: e && e.name === 'AbortError' ? 'TIMEOUT' : (e && e.message) || String(e)
        }
      }
    }
  }
  return 'installed'
})()
