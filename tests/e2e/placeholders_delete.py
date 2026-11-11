import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import BASE_URL, PROJECT_ROOT
import sys, re, json; sys.path.insert(0,'.')
from playwright.sync_api import sync_playwright
Q="Please write an email to my professor about my project."
D="""Subject: Question about [Course Code / Section] project

Dear Professor [Last Name],

I am a student in [Course Code / Section]. My name is [Your Name], and I would like to ask about the project. Please call me [Your Name] in class.

Thank you for your time and support.

Best regards,

[Your Name]"""
R=[]
def check(n,ok,d=''): R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+n,d,flush=True)
ED='[data-slate-editor="true"]'
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True); ctx=b.new_context(viewport={'width':1700,'height':1100}); pg=ctx.new_page()
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.route('**/generate-first-draft', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps({'draft':D})))
    pg.goto(BASE_URL+'/?pid=zz_dl'); pg.wait_for_timeout(1500)
    pg.fill('input[placeholder="Enter username"]','ZZDL'); pg.press('input[placeholder="Enter username"]','Enter'); pg.wait_for_timeout(2500)
    pg.fill('textarea[placeholder^="Please input"]',Q); pg.locator('button').nth(1).click(); pg.wait_for_timeout(2500)
    pg.wait_for_timeout(300)  # the draft starts when the request is sent
    pg.wait_for_function("(()=>{const m=document.body.innerText.match(/Email Components \\((\\d+)\\)/);return m&&parseInt(m[1])>0})()", timeout=900000)
    pg.wait_for_function("!document.querySelector('.draft-generating-page')", timeout=900000); pg.wait_for_timeout(2500)
    try: pg.get_by_text('Got it').click(timeout=8000)
    except Exception: pass
    rows=lambda: pg.locator('.placeholder-table tbody tr')
    labs=lambda: [rows().nth(i).locator('td').first.inner_text().strip() for i in range(rows().count())]
    inp=pg.locator('.placeholder-table input[placeholder="Enter value"]')
    print('rows', labs())
    check('every row has a delete icon', pg.locator('.pt-delete').count()==rows().count())
    # layout: icon left of the text, the table text keeps its left edge
    ib=pg.locator('.pt-delete').first.bounding_box(); tb=rows().first.locator('td').first.bounding_box()
    check('the icon is left of the row text and inside the sidebar card', ib['x']+ib['width']<=tb['x']+1 and ib['x']>=pg.locator('.placeholder-table').bounding_box()['x'], f"icon x {round(ib['x'])}-{round(ib['x']+ib['width'])}, text x {round(tb['x'])}")
    pg.locator('.placeholder-table').screenshot(path='del_table.png')
    t0=pg.inner_text(ED)
    # delete a single-bracket field
    pg.get_by_role('button', name='Delete [Last Name]').click(); pg.wait_for_timeout(800); t=pg.inner_text(ED)
    check('delete [Last Name]: bracket gone, tidy punctuation', '[Last Name]' not in t and 'Dear Professor,' in t, re.findall(r'Dear Professor[^\n]*',t)[0])
    check('the row is gone', '[Last Name]' not in labs())
    # undo
    pg.mouse.click(5,5); pg.keyboard.press('Meta+z'); pg.wait_for_timeout(900); t=pg.inner_text(ED)
    check('Cmd+Z brings the bracket back in one step', 'Dear Professor [Last Name],' in t)
    check('and the row comes back', '[Last Name]' in labs())
    # filled field deleted: value text goes too
    inp.nth(labs().index('[Your Name]')).fill('Mia'); pg.wait_for_timeout(1300)
    check('filled with Mia in 3 places', pg.inner_text(ED).count('Mia')==3)
    pg.get_by_role('button', name='Delete [Your Name]').click(); pg.wait_for_timeout(900); t=pg.inner_text(ED)
    check('delete a filled field: all its text goes, no blank leftovers', 'Mia' not in t and '[Your Name]' not in t and 'My name is, and' in t and 'Please call me in class.' in t and t.rstrip().endswith('Best regards,'), repr(t[-80:]))
    check('its row is gone', '[Your Name]' not in labs())
    # composite: delete one half
    pg.get_by_role('button', name='Delete [Course Code]').click(); pg.wait_for_timeout(900); t=pg.inner_text(ED)
    check('delete one half of [A / B]: only that part goes', 'Course Code' not in t and t.count('[Section]')==2, re.findall(r'\[Section\][^\n]{0,12}',t)[:2].__repr__())
    check('the other half stays as a row', '[Section]' in labs() and '[Course Code]' not in labs())
    # units still work after the deletions
    U=ED+' .unit-leaf'; k=next(i for i in range(pg.locator(U).count()) if 'Thank you' in pg.locator(U).nth(i).inner_text() or 'student' in pg.locator(U).nth(i).inner_text())
    pg.locator(U).nth(k).click(position={'x':10,'y':8}); pg.wait_for_timeout(1500)
    check('a unit can still be selected after deleting', pg.locator(f'{U}.unit-selected').count()>=1)
    # draft file follows? (via the server) -> ok if the page shows it; check the table value state cleared
    check('no page errors', not errs, str(errs[:2]))
    b.close()
print(sum(R),'/',len(R))
