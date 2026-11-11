import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import BASE_URL, PROJECT_ROOT
import sys, re, json; sys.path.insert(0,'.')
from playwright.sync_api import sync_playwright
Q="Please write an email to my professor to ask for an extension."
D="""Subject: Extension request for [Project Name]

Dear Professor [Last Name],

I am writing about my project. [briefly state your reason, e.g., an unexpected illness / unforeseen circumstances], which has affected my work. I have [mention progress, e.g., completed the initial research] so far.

Could I submit it by [Proposed New Date, e.g., Friday, October 27th at 5:00 PM]? The extension would be about [desired extension period, for example two weeks]. See you in [Section Number/Time, such as Section 01].

Thank you,

[Your Name]"""
R=[]
def check(n,ok,d=''): R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+n,d,flush=True)
ED='[data-slate-editor="true"]'
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True); ctx=b.new_context(viewport={'width':1700,'height':1100}); pg=ctx.new_page()
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.route('**/generate-first-draft', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps({'draft':D})))
    pg.goto(BASE_URL+'/?pid=zz_eg'); pg.wait_for_timeout(1500)
    pg.fill('input[placeholder="Enter username"]','ZZEG'); pg.press('input[placeholder="Enter username"]','Enter'); pg.wait_for_timeout(2500)
    pg.fill('textarea[placeholder^="Please input"]',Q); pg.locator('button').nth(1).click(); pg.wait_for_timeout(2500)
    pg.wait_for_timeout(300)  # the draft starts when the request is sent
    pg.wait_for_function("(()=>{const m=document.body.innerText.match(/Email Components \\((\\d+)\\)/);return m&&parseInt(m[1])>0})()", timeout=900000)
    pg.wait_for_function("!document.querySelector('.draft-generating-page')", timeout=900000); pg.wait_for_timeout(2500)
    try: pg.get_by_text('Got it').click(timeout=8000)
    except Exception: pass
    rows=pg.locator('.placeholder-table tbody tr'); inp=pg.locator('.placeholder-table input[placeholder="Enter value"]')
    labs=lambda: [rows.nth(i).locator('td').first.inner_text().strip() for i in range(rows.count())]
    hint=lambda i: rows.nth(i).locator('.pt-hint').inner_text() if rows.nth(i).locator('.pt-hint').count() else ''
    print('rows', labs(), [hint(i) for i in range(rows.count())])
    check('no rows for the reason and progress brackets', all('reason' not in l.lower() and 'progress' not in l.lower() for l in labs()))
    t=pg.inner_text(ED)
    check('those brackets stay in the email as they are', '[briefly state your reason, e.g., an unexpected illness / unforeseen circumstances]' in t and '[mention progress, e.g., completed the initial research]' in t)
    check('label keeps only the text before e.g.', '[Proposed New Date]' in labs() and '[desired extension period]' in labs() and '[Section Number/Time]' in labs(), str(labs()))
    check('no example text under the inputs', pg.locator('.pt-hint').count()==0 and 'Friday, October' not in pg.locator('.placeholder-table').inner_text())
    pg.locator('.placeholder-table').screenshot(path='eg_table.png')
    # fill, clear, restore
    i=labs().index('[Proposed New Date]'); inp.nth(i).fill('May 5'); pg.wait_for_timeout(1300); t=pg.inner_text(ED)
    check('filling replaces the whole bracket (example included)', 'by May 5?' in t and 'Proposed New Date' not in t, re.findall(r'submit it by [^?]*\?',t)[0])
    inp.nth(labs().index('[Proposed New Date]')).fill(''); pg.wait_for_timeout(1300); t=pg.inner_text(ED)
    check('emptying the input restores the bracket exactly, example included', '[Proposed New Date, e.g., Friday, October 27th at 5:00 PM]' in t)
    # delete one with an example
    pg.get_by_role('button', name='Delete [desired extension period]').click(); pg.wait_for_timeout(900); t=pg.inner_text(ED)
    check('delete removes the whole bracket (example included)', 'extension period' not in t and 'two weeks' not in t and 'would be about.' in t.replace(' .','.'), re.findall(r'The extension would be about[^\n]{0,30}',t).__repr__())
    pg.mouse.click(5,5); pg.keyboard.press('Meta+z'); pg.wait_for_timeout(900); t=pg.inner_text(ED)
    check('undo restores it exactly', '[desired extension period, for example two weeks]' in t)
    # version cards for the unit with the reason bracket
    U=ED+' .unit-leaf'; k=next((i for i in range(pg.locator(U).count()) if 'briefly state your reason' in pg.locator(U).nth(i).inner_text()), None)
    print('unit with reason bracket:', k)
    if k is not None:
        pt=pg.locator(U).nth(k).evaluate("e=>{const r=e.getClientRects()[0];return [r.left+r.width/2,r.top+r.height/2]}"); pg.mouse.click(pt[0],pt[1]); pg.wait_for_function("document.querySelector('.vc-card')", timeout=300000); pg.wait_for_timeout(800)
        texts=pg.locator('.vc-card').all_inner_texts(); print([x.replace('\n',' | ')[:160] for x in texts])
        check('version cards replace the reason bracket with concrete wording (no square brackets)', len(texts)==3 and all('[' not in x and ']' not in x for x in texts))
    else:
        check('found the unit with the reason bracket', False)
    check('no page errors', not errs, str(errs[:2]))
    b.close()
print(sum(R),'/',len(R))
