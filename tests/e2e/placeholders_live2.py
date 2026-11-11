import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import BASE_URL, PROJECT_ROOT
import sys, re, json, glob; sys.path.insert(0,'.')
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
    pg.goto(BASE_URL+'/?pid=zz_pl2'); pg.wait_for_timeout(1500)
    pg.fill('input[placeholder="Enter username"]','ZZPL2'); pg.press('input[placeholder="Enter username"]','Enter'); pg.wait_for_timeout(2500)
    pg.fill('textarea[placeholder^="Please input"]',Q); pg.locator('button').nth(1).click(); pg.wait_for_timeout(2500)
    pg.wait_for_timeout(300)  # the draft starts when the request is sent
    pg.wait_for_function("(()=>{const m=document.body.innerText.match(/Email Components \\((\\d+)\\)/);return m&&parseInt(m[1])>0})()", timeout=900000)
    pg.wait_for_function("!document.querySelector('.draft-generating-page')", timeout=900000); pg.wait_for_timeout(2500)
    try: pg.get_by_text('Got it').click(timeout=8000)
    except Exception: pass
    rows=pg.locator('.placeholder-table tbody tr'); inp=pg.locator('.placeholder-table input[placeholder="Enter value"]')
    labs=[rows.nth(i).locator('td').first.inner_text().strip() for i in range(rows.count())]; print('rows', labs)
    def put(label, text):
        i=labs.index(label); inp.nth(i).fill(text); pg.wait_for_timeout(1300)
    t0=pg.inner_text(ED)
    put('[Course Code]','CS702'); t=pg.inner_text(ED)
    check('composite: first part filled, separator and the other part kept', 'CS702 / [Section]' in t and t.count('CS702')==2, re.findall(r'CS702[^\n.,]{0,14}', t)[:2].__repr__())
    put('[Section]','G1'); t=pg.inner_text(ED)
    check('composite: second part filled', 'CS702 / G1' in t and '[Section]' not in t)
    put('[Course Code]',''); t=pg.inner_text(ED)
    check('composite: clearing one part restores only its bracket', '[Course Code] / G1' in t and 'CS702' not in t)
    put('[Your Name]','Mia'); t=pg.inner_text(ED)
    check('a field in three places is filled everywhere (also the signature)', t.count('Mia')==3 and '[Your Name]' not in t, str(t.count('Mia')))
    # unit with the signature: select it, then use a version card
    U=ED+' .unit-leaf'; ids=[pg.locator(U).nth(i).get_attribute('data-unit') for i in range(pg.locator(U).count())]
    sig=[i for i in range(pg.locator(U).count()) if 'Mia' in pg.locator(U).nth(i).inner_text()][-1:]
    if sig:
        uid=ids[sig[0]]; pg.locator(U).nth(sig[0]).click(position={'x':10,'y':8}); pg.wait_for_function("document.querySelector('.vc-card')", timeout=300000); pg.wait_for_timeout(800)
        pg.locator('.vc-card').first.get_by_role('button', name='Use').click(); pg.wait_for_timeout(8000)
        m=pg.locator('.ant-modal:visible:has-text("Apply this change to other parts?")')
        if m.count(): m.get_by_role('button', name='Skip').click(); pg.wait_for_timeout(800)  # a style intent asks before it reaches the other units
        t=pg.inner_text(ED); print('after Use, Mia count', t.count('Mia'))
        i=labs.index('[Your Name]')
        check('after Use on a unit with the field, the field is still in the table', any(inp.nth(j).input_value()=='Mia' for j in range(inp.count())))
        inp2=pg.locator('.placeholder-table input[placeholder="Enter value"]')
        k=[j for j in range(inp2.count()) if inp2.nth(j).input_value()=='Mia']
        if k:
            inp2.nth(k[0]).fill('Noa'); pg.wait_for_timeout(1300); t=pg.inner_text(ED)
            check('live edit still reaches every place after Use', 'Mia' not in t and t.count('Noa')>=1, str(t.count('Noa')))
    else:
        check('found a unit with the signature', False)
    # delete the filled text by hand (all three places) -> the row goes
    pg.locator(ED+' [data-slate-string]:visible').nth(2).click(); pg.wait_for_timeout(500)
    for _ in range(4):
        ok=pg.evaluate("""()=>{const ed=document.querySelector('[data-slate-editor="true"]');const w=document.createTreeWalker(ed,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){const i=n.textContent.indexOf('Noa');if(i!==-1&&n.parentElement.hasAttribute('data-slate-string')&&n.parentElement.offsetParent){const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+3);const s=getSelection();s.removeAllRanges();s.addRange(r);return true}}return false}""")
        if not ok: break
        pg.wait_for_timeout(300); pg.keyboard.press('Backspace'); pg.wait_for_timeout(500)
    pg.wait_for_timeout(800)
    print('EMAIL AFTER DELETE:', repr(pg.inner_text(ED)[-420:]))
    left=[pg.locator('.placeholder-table tbody tr').nth(i).locator('td').first.inner_text().strip() for i in range(pg.locator('.placeholder-table tbody tr').count())]
    check('deleting all the filled text by hand removes the row', '[Your Name]' not in left, str(left))
    pg.mouse.click(5,5)
    check('no page errors', not errs, str(errs[:2]))
    b.close()
print(sum(R),'/',len(R))
