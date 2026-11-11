import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import BASE_URL, PROJECT_ROOT
import sys, json, time, re, urllib.request
sys.path.insert(0,'.')
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'propagation_window.py')).read().split("with sync_playwright() as p:")[0])
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome', headless=True)
    pg=b.new_context(viewport={'width':1700,'height':1100}).new_page()
    pg.goto(BASE); pg.wait_for_timeout(1500)
    pg.fill('input[placeholder="Enter username"]','ZZPROP'); pg.press('input[placeholder="Enter username"]','Enter'); pg.wait_for_timeout(2500)
    pg.fill('textarea[placeholder^="Please input"]',Q); pg.locator('button').nth(1).click(); pg.wait_for_timeout(2500)
    pg.wait_for_function("(()=>{const m=document.body.innerText.match(/Email Components \\((\\d+)\\)/);return m&&parseInt(m[1])>0})()", timeout=900000)
    pg.wait_for_function("!document.querySelector('.draft-generating-page') && !document.querySelector('button.ant-btn-loading')", timeout=900000); pg.wait_for_timeout(2500)
    try: pg.get_by_text('Got it').click(timeout=8000)
    except Exception: pass
    cur=None
    for t in pg.evaluate("()=>performance.getEntriesByType('resource').map(e=>e.name).filter(n=>n.includes('intents/current.json'))"):
        cur=json.load(urllib.request.urlopen(t)); break
    DIMS.extend(i['dimension'].strip().lower() for i in cur)
    units=list(dict.fromkeys([pg.locator(U).nth(i).get_attribute('data-unit') for i in range(pg.locator(U).count()) if pg.locator(U).nth(i).get_attribute('data-unit')]))
    units=[u for u in units if not re.search('salutation|valediction', u, re.I)]  # these two are changed on their own: nothing is carried from or to them
    per={}
    for u in units:
        if click_unit(pg,u): per[u]=pills(pg)
    count={}
    for ps in per.values():
        for d in ps: count[d]=count.get(d,0)+1
    d=sorted([k for k,n in count.items() if n>=2], key=lambda k:-count[k])[0]; src=[u for u in per if d in per[u]][0]
    stub_check(pg,'all')
    use(pg,src,d,0); pg.locator(MODAL).wait_for(timeout=60000); pg.wait_for_timeout(800)
    def pos():
        r=pg.locator('.ant-modal:visible').first.bounding_box(); v=pg.viewport_size
        return round((r['y']+r['height']/2)-v['height']/2), round((r['x']+r['width']/2)-v['width']/2), v
    print('1700x1100 centre offset (y,x):', pos())
    pg.set_viewport_size({'width':1280,'height':700}); pg.wait_for_timeout(500)
    print('1280x700 centre offset (y,x):', pos())
    pg.wait_for_function("!document.querySelector('.ant-modal .ant-spin')", timeout=300000); pg.wait_for_timeout(800)
    print('after the rewrites arrived (y,x):', pos())
