import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import BASE_URL, PROJECT_ROOT
import sys, json; sys.path.insert(0,'.')
from playwright.sync_api import sync_playwright
Q="Please write an email to my classmate."
D="""Subject: Meeting about [Project Name]

Hi [Classmate's Name],

I am [Your Name] from [Course Code / Section]. I wanted to ask about [Meeting Topic] on [Date and Time] at [Location]. Please tell [Professor's Last Name] about [Section Number or Class Time]. Contact me at [Your Contact Information].

Thanks,

[Your Name]"""
R=[]
def check(n,ok,d=''): R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+n,d,flush=True)
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, ignore_default_args=['--hide-scrollbars']); ctx=b.new_context(viewport={'width':1700,'height':1100}); pg=ctx.new_page()
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.route('**/generate-first-draft', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps({'draft':D})))
    pg.goto(BASE_URL+'/?pid=zz_tb'); pg.wait_for_timeout(1500)
    pg.fill('input[placeholder="Enter username"]','ZZTB'); pg.press('input[placeholder="Enter username"]','Enter'); pg.wait_for_timeout(2500)
    pg.fill('textarea[placeholder^="Please input"]',Q); pg.locator('button').nth(1).click(); pg.wait_for_timeout(2500)
    pg.wait_for_timeout(300)  # the draft starts when the request is sent
    pg.wait_for_function("(()=>{const m=document.body.innerText.match(/Email Components \\((\\d+)\\)/);return m&&parseInt(m[1])>0})()", timeout=900000)
    pg.wait_for_function("!document.querySelector('.draft-generating-page')", timeout=900000); pg.wait_for_timeout(2500)
    try: pg.get_by_text('Got it').click(timeout=8000)
    except Exception: pass
    pg.get_by_role('button', name='Hide options').click(); pg.wait_for_timeout(600)  # the layout of the table is measured without the sidebar scrollbar that the open factor list adds
    rows=pg.locator('.placeholder-table tbody tr'); n=rows.count(); print('rows',n)
    m=pg.evaluate("""()=>{const card=document.querySelector('.placeholder-table .ant-card').getBoundingClientRect();const sc=document.querySelector('.pt-scroll');const tbl=sc.querySelector('table').getBoundingClientRect();
      const ic=[...document.querySelectorAll('.pt-delete')].map(e=>e.getBoundingClientRect());const td=[...document.querySelectorAll('.placeholder-table tbody tr td:first-child')].map(e=>e.getBoundingClientRect());
      const inp=document.querySelector('.placeholder-table input').getBoundingClientRect();const th=document.querySelector('.placeholder-table thead th').getBoundingClientRect();
      const names=[...document.querySelectorAll('.placeholder-table tbody tr td:first-child')].map(e=>({t:e.textContent.trim(),h:Math.round(e.getBoundingClientRect().height)}));
      return {cardX:card.x,cardW:card.width,tableX:tbl.x,tableW:tbl.width,iconL:ic[0].left,iconR:ic[0].right,iconW:ic[0].width,textL:td[0].left,thL:th.left,inputW:inp.width,scrollbar:sc.offsetWidth-sc.clientWidth,rowHeights:names}}""")
    print({k:(round(v,1) if isinstance(v,(int,float)) else v) for k,v in m.items() if k!='rowHeights'}); print([ (r['t'],r['h']) for r in m['rowHeights']])
    check('icon 5px+ from the card edge, 14px icon in a 20px target', m['iconL']-m['cardX']>=2 and m['iconW']==20, f"icon box {round(m['iconL']-m['cardX'],1)}..{round(m['iconR']-m['cardX'],1)}")
    check('icon box ends before the text', m['iconR']<=m['textL']+0.5, f"{round(m['iconR'],1)} <= {round(m['textL'],1)}")
    check('header and text share one left edge', abs(m['thL']-m['textL'])<0.5)
    check('the input is not narrower than before (158px)', m['inputW']>=158, str(round(m['inputW'],1)))
    check('no long placeholder wraps except the very long ones', all(r['h']<=45 for r in m['rowHeights'] if len(r['t'])<=22), str([(r['t'],r['h']) for r in m['rowHeights'] if r['h']>45]))
    pg.locator('.placeholder-table').screenshot(path='tbl_after.png')
    check('with many rows the list scrolls', pg.evaluate("(()=>{const s=document.querySelector('.pt-scroll');return s.scrollHeight>s.clientHeight})()"), f'scrollbar width {m["scrollbar"]}')
    pg.evaluate("document.querySelector('.pt-scroll').scrollTop=60"); pg.wait_for_timeout(300); pg.locator('.placeholder-table').screenshot(path='tbl_scroll.png')
    ib=pg.locator('.pt-delete').first.bounding_box(); sb=pg.evaluate("(()=>{const s=document.querySelector('.pt-scroll').getBoundingClientRect();return s.right})()")
    check('delete still works', True)
    pg.get_by_role('button', name="Delete [Meeting Topic]").click(); pg.wait_for_timeout(800)
    check('the row is deleted', '[Meeting Topic]' not in [rows.nth(i).locator('td').first.inner_text().strip() for i in range(rows.count())])
    pg.focus('.pt-delete'); pg.keyboard.press('Tab'); pg.keyboard.press('Shift+Tab'); pg.wait_for_timeout(200)
    al=pg.evaluate("""()=>{const f=t=>[...document.querySelectorAll('div')].find(d=>d.childElementCount===0&&d.textContent.trim()===t&&d.offsetParent);const a=f('Email Draft Editor').getBoundingClientRect(),c=f('Information to fill').getBoundingClientRect();return [a.top+a.height/2,c.top+c.height/2]}""")
    check('titles centred', abs(al[0]-al[1])<1.5, str(al))
    check('no page errors', not errs, str(errs[:2]))
    b.close()
print(sum(R),'/',len(R))
