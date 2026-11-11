import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import BASE_URL, PROJECT_ROOT
import sys, re, json, glob; sys.path.insert(0,'.')
from playwright.sync_api import sync_playwright
from common3 import *
R=[]
def check(n,ok,d=''): R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+n,d,flush=True)
ED='[data-slate-editor="true"]'
ROOT=f'{PROJECT_ROOT}/src/data/SessionData/ZZPL'
def draft_file():
    fs=sorted(glob.glob(ROOT+'/*/drafts/latest.md'))
    return open(fs[-1],encoding='utf-8').read() if fs else ''
with sync_playwright() as p:
    b,pg=setup(p,'cards','zz_pl','ZZPL')
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    try: pg.get_by_text('Got it').click(timeout=8000)
    except Exception: pass
    rows=lambda: pg.locator('.placeholder-table tbody tr')
    labels=lambda: [r.locator('td').first.inner_text().strip() for r in range(0)] 
    n=rows().count(); print('rows:', n, [rows().nth(i).locator('td').first.inner_text().strip() for i in range(n)])
    inp=pg.locator('.placeholder-table input[placeholder="Enter value"]')
    lab0=rows().nth(0).locator('td').first.inner_text().strip()   # e.g. [Your Name]
    count0=pg.inner_text(ED).count(lab0)
    check('the first placeholder is in the email', count0>=1, f'{lab0} x{count0}')
    inp.nth(0).fill('Alexandria'); pg.wait_for_timeout(1200)
    t=pg.inner_text(ED)
    check('typing fills the email live (all occurrences)', 'Alexandria' in t and lab0 not in t and t.count('Alexandria')==count0, f'{t.count("Alexandria")} of {count0}')
    check('the row stays with its value', rows().count()==n and inp.nth(0).input_value()=='Alexandria')
    check('the draft file follows', 'Alexandria' in draft_file() and lab0 not in draft_file())
    # change the value
    inp.nth(0).fill('Bob'); pg.wait_for_timeout(1200); t=pg.inner_text(ED)
    check('changing the value replaces the old text', 'Bob' in t and 'Alexandria' not in t and t.count('Bob')==count0)
    # undo
    pg.mouse.click(5,5); pg.keyboard.press('Meta+z'); pg.wait_for_timeout(800); t=pg.inner_text(ED)
    check('Cmd+Z undoes the table edit', 'Bob' not in t, f'brackets back: {lab0 in t}')
    pg.keyboard.press('Meta+Shift+z'); pg.wait_for_timeout(800); t=pg.inner_text(ED)
    check('redo brings it back', 'Bob' in t or 'Alexandria' in t)
    inp.nth(0).fill('Bob'); pg.wait_for_timeout(1200)
    # unit click keeps the link
    U=ED+' .unit-leaf'; k=next(i for i in range(pg.locator(U).count()) if 'Bob' in pg.locator(U).nth(i).inner_text())
    uid=pg.locator(U).nth(k).get_attribute('data-unit')
    pg.locator(U).nth(k).click(position={'x':8,'y':8}); pg.wait_for_timeout(1500)
    check('selecting a unit with a filled field highlights it', pg.locator(f'{U}.unit-selected[data-unit="{uid}"]').count()>=1)
    check('row and email value survive the selection', inp.nth(0).input_value()=='Bob' and 'Bob' in pg.inner_text(ED))
    inp.nth(0).fill('Robert'); pg.wait_for_timeout(1200)
    check('live change works after the unit was selected', 'Robert' in pg.inner_text(ED) and 'Bob' not in pg.inner_text(ED))
    # unit content follows: the highlight still works
    pg.mouse.click(5,5); pg.wait_for_timeout(300)
    pg.locator(U).nth(k).click(position={'x':8,'y':8}); pg.wait_for_timeout(800)
    # manual edit in the email -> the input follows
    pg.locator(ED+' [data-slate-string]:visible', has_text='Robert').first.click(); pg.wait_for_timeout(800)
    pg.keyboard.press('End'); pg.keyboard.press('ArrowLeft'); pg.keyboard.type('X'); pg.wait_for_timeout(1000)
    tx=pg.inner_text(ED); m=re.search(r'Robert\w*',tx) or re.search(r'Rober\wt',tx)
    print('input now:', repr(inp.nth(0).input_value()), '| email has:', [w for w in re.findall(r'\w*Rob\w*', tx)][:3])
    check('editing the filled text in the email updates the input', inp.nth(0).input_value()!='Robert' and inp.nth(0).input_value() in pg.inner_text(ED))
    # a second field
    if n>1:
        lab1=rows().nth(1).locator('td').first.inner_text().strip(); c1=pg.inner_text(ED).count(lab1)
        inp.nth(1).fill('Zed'); pg.wait_for_timeout(1200)
        check('a second field fills too', 'Zed' in pg.inner_text(ED) and (lab1 not in pg.inner_text(ED)))
    # Clear All
    pg.locator('.placeholder-table').get_by_role('button', name='Clear All').click(); pg.wait_for_timeout(1200); t=pg.inner_text(ED)
    check('Clear All puts the brackets back', lab0 in t and 'Zed' not in t and all(inp.nth(i).input_value()=='' for i in range(inp.count())))
    # regenerate with options keeps the values
    inp.nth(0).fill('Dana'); pg.wait_for_timeout(1200)
    pg.get_by_role('button', name='Regenerate with These Options').click()
    pg.wait_for_selector('.draft-generating-page', timeout=30000); pg.wait_for_selector('.draft-generating-page', state='detached', timeout=900000); pg.wait_for_timeout(3000)
    t=pg.inner_text(ED); inp=pg.locator('.placeholder-table input[placeholder="Enter value"]')
    ok_row = any(inp.nth(i).input_value()=='Dana' for i in range(inp.count()))
    check('Regenerate with These Options keeps the value in the email and the table', 'Dana' in t and ok_row, f'rows={inp.count()}')
    if ok_row:
        i=[j for j in range(inp.count()) if inp.nth(j).input_value()=='Dana'][0]
        inp.nth(i).fill('Eve'); pg.wait_for_timeout(1200)
        check('live changes still work on the new draft', 'Eve' in pg.inner_text(ED) and 'Dana' not in pg.inner_text(ED))
    # components regenerate keeps the field
    pg.get_by_role('button', name='Regenerate', exact=True).first.click()
    pg.wait_for_function("!document.querySelector('button.ant-btn-loading')", timeout=900000); pg.wait_for_timeout(3000)
    inp=pg.locator('.placeholder-table input[placeholder="Enter value"]')
    check('Regenerate (components) keeps the filled field and its row', any(inp.nth(i).input_value()=='Eve' for i in range(inp.count())) and 'Eve' in pg.inner_text(ED))
    al=pg.evaluate("""()=>{const f=t=>[...document.querySelectorAll('div')].find(d=>d.childElementCount===0&&d.textContent.trim()===t&&d.offsetParent);const a=f('Email Draft Editor').getBoundingClientRect(),c=f('Information to fill').getBoundingClientRect();return [a.top+a.height/2,c.top+c.height/2]}""")
    check('titles centred', abs(al[0]-al[1])<1.5, str(al))
    check('no page errors', not errs, str(errs[:2]))
    b.close()
print(sum(R),'/',len(R))
