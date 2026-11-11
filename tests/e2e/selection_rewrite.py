import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import BASE_URL, PROJECT_ROOT
import json, sys
sys.path.insert(0, '.')
from playwright.sync_api import sync_playwright
from common3 import *
PID = 'zz_lg'; USER = 'ZZLG'
R = []
def check(name, ok, detail=''):
    R.append((name, bool(ok), detail)); print(('PASS ' if ok else 'FAIL ') + name, detail, flush=True)
U = '[data-slate-editor="true"] .unit-leaf'
norm = lambda t: ' '.join(t.split())
text = lambda pg: pg.inner_text('[data-slate-editor="true"]')
with sync_playwright() as p:
    b, pg = setup(p, 'cards', PID, USER)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    try: pg.get_by_text('Got it').click(timeout=1500)
    except Exception: pass
    pg.evaluate("window.__sel=''; document.addEventListener('mouseup', () => { window.__sel = getSelection().toString(); }, true)")
    reqs = []
    def stub(route):
        d = json.loads(route.request.post_data); reqs.append(d)
        multi = '\n' in d['selectedContent']
        route.fulfill(status=200, content_type='application/json', body=json.dumps({'rewrittenContent': 'NEW PARA ONE\n\nNEW PARA TWO' if multi else 'WHOLE UNIT NEW'}))
    pg.route('**/ai-generate-rewrite', stub)
    n = pg.locator(U).count(); check('units are spans', n >= 3, str(n))
    k = next(i for i, t in enumerate(pg.locator(U).all_inner_texts()) if len(t) > 40 and pg.locator(U).nth(i).get_attribute('data-unit') != 'subject_line' and not t.startswith('Subject') and not t.startswith('Apolog') and not t.startswith('Absence'))
    span = pg.locator(U).nth(k); span.scroll_into_view_if_needed(); pg.wait_for_timeout(300)
    uid = span.get_attribute('data-unit'); unit_text = norm(span.inner_text())
    span.hover(); pg.wait_for_timeout(300)
    check('hover tint', pg.evaluate("(u) => [...document.querySelectorAll(`[data-unit=\"${u}\"]`)].every(e => e.classList.contains('unit-hover'))", uid))
    check('hover cursor pointer', span.evaluate("e => getComputedStyle(e).cursor") == 'pointer')
    pg.mouse.move(5, 5); pg.wait_for_timeout(200)
    check('hover removed', pg.locator('.unit-hover').count() == 0)
    before = text(pg)
    span.click(position={'x': 30, 'y': 8}); pg.wait_for_timeout(800)
    check('first click: no box', pg.locator('.rw-box').count() == 0)
    check('first click: unit highlighted', pg.locator(f'{U}.unit-selected[data-unit="{uid}"]').count() >= 1)
    span = pg.locator(f'{U}[data-unit="{uid}"]').first
    check('selected cursor text', span.evaluate("e => getComputedStyle(e).cursor") == 'text')
    span.click(position={'x': 30, 'y': 8}); pg.wait_for_timeout(600)
    check('second click opens box', pg.locator('.rw-box').count() == 1)
    pg.fill('.rw-input', 'rewrite'); pg.keyboard.press('Enter'); pg.wait_for_selector('.rw-preview', timeout=10000)
    pg.get_by_role('button', name='Accept').click(); pg.wait_for_timeout(1500)
    after = text(pg)
    exp=norm(before).replace(unit_text, 'WHOLE UNIT NEW', 1); check('accept replaced unit', norm(after) == exp, repr(unit_text[:50])+' | '+repr(norm(after)[:200])+' || '+repr(exp[:200]))
    pg.mouse.click(5, 5); pg.wait_for_timeout(200)
    pg.keyboard.press('Meta+z'); pg.wait_for_timeout(1500)
    check('undo restores', norm(text(pg)) == norm(before), norm(text(pg))[:80])
    pg.keyboard.press('Meta+Shift+z'); pg.wait_for_timeout(1500)
    check('redo reapplies', norm(text(pg)) == norm(after))
    pg.keyboard.press('Meta+z'); pg.wait_for_timeout(1500)
    # ---- cross-paragraph selection
    pg.evaluate("window.scrollTo(0,0)")
    pos = pg.evaluate("""() => { const ps = [...document.querySelectorAll('[data-slate-editor="true"] > *')].filter(e => e.innerText.replace(/Copy|SUBJECT|BODY/gi,'').trim().length > 20);
        const a = ps[0], c = ps[1];
        const na = [...a.querySelectorAll('[data-slate-string]')].find(x => x.offsetParent).firstChild;
        const nc = [...c.querySelectorAll('[data-slate-string]')].find(x => x.offsetParent).firstChild;
        const ra = document.createRange(); ra.setStart(na, 3); ra.setEnd(na, 8); const rc = document.createRange(); rc.setStart(nc, 0); rc.setEnd(nc, 5);
        const qa = ra.getClientRects()[0], qc = rc.getClientRects()[0];
        return {x1: qa.left + 1, y1: qa.top + qa.height / 2, x2: qc.right - 1, y2: qc.top + qc.height / 2}; }""")
    pg.mouse.move(pos['x1'], pos['y1']); pg.mouse.down(); pg.mouse.move(pos['x2'], pos['y2'], steps=8); pg.mouse.up(); pg.wait_for_timeout(700)
    check('cross-paragraph box opens', pg.locator('.rw-box').count() == 1)
    mb = text(pg)
    pg.fill('.rw-input', 'rewrite'); pg.keyboard.press('Enter'); pg.wait_for_selector('.rw-preview', timeout=10000)
    check('request has multi paragraphs', '\n' in reqs[-1]['selectedContent'], repr(reqs[-1]['selectedContent'][:60]))
    pg.get_by_role('button', name='Accept').click(); pg.wait_for_timeout(1500)
    ma = text(pg)
    check('multi accept applied', 'NEW PARA ONE' in ma and 'NEW PARA TWO' in ma and ma != mb)
    pg.mouse.click(5, 5); pg.wait_for_timeout(200)
    pg.keyboard.press('Meta+z'); pg.wait_for_timeout(1500)
    check('multi undo restores', norm(text(pg)) == norm(mb))
    check('units restored after undo', pg.locator(U).count() >= 3, str(pg.locator(U).count()))
    check('no page errors', not errs, str(errs[:2]))
    b.close()
print(sum(1 for r in R if r[1]), '/', len(R))
