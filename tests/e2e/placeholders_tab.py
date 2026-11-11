import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import BASE_URL, PROJECT_ROOT
import sys, json
sys.path.insert(0,'.')
from playwright.sync_api import sync_playwright
R=[]
def check(n,ok,d=''): R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+n,d,flush=True)
D="Subject: Meeting about [Project Name]\n\nHi [Classmate's Name],\n\nI am [Your Name] from [Course Code]. Can we meet on [Date and Time] at [Location]?\n\nThanks,\n\n[Your Name]"
COMPS=[{"id":"all","title":"All","content":"I am [Your Name] from [Course Code]. Can we meet on [Date and Time] at [Location]?"}]
INTENTS=[{"dimension":"Level of Warmth","current_value":"Warm","other_values":["Neutral","Brief","Formal"]}]
j=lambda body: dict(status=200, content_type='application/json', body=json.dumps(body))
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome', headless=True); pg=b.new_context(viewport={'width':1700,'height':1100}).new_page(); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.route('**/select-factors', lambda r: r.fulfill(**j({'selectedFactors':{},'selectedValues':{}})))
    pg.route('**/generate-first-draft', lambda r: r.fulfill(**j({'draft':D})))
    pg.route('**/component-extractor', lambda r: r.fulfill(**j({'components':json.dumps(COMPS)})))
    pg.route('**/intent-analyzer-new', lambda r: r.fulfill(**j({'message':'ok','intents':INTENTS})))
    pg.route('**/component-intent-link', lambda r: r.fulfill(**j({'links':[{'intent_dimension':'Level of Warmth','component_id':'all'}]})))
    pg.route('**/intents/current.json', lambda r: r.fulfill(**j(INTENTS)))
    pg.goto(BASE_URL+'/?pid=zz_tab'); pg.wait_for_timeout(1500)
    pg.fill('input[placeholder="Enter username"]','ZZTAB'); pg.press('input[placeholder="Enter username"]','Enter'); pg.wait_for_timeout(2500)
    pg.fill('textarea[placeholder^="Please input"]','Write to my classmate.'); pg.locator('button').nth(1).click(); pg.wait_for_timeout(2500)
    pg.wait_for_function("(()=>{const m=document.body.innerText.match(/Email Components \\((\\d+)\\)/);return m&&parseInt(m[1])>0})()", timeout=120000)
    pg.wait_for_function("!document.querySelector('.draft-generating-page')", timeout=120000); pg.wait_for_timeout(1500)
    try: pg.get_by_text('Got it').click(timeout=5000)
    except Exception: pass
    boxes=pg.locator('.placeholder-table input[placeholder="Enter value"]'); n=boxes.count()
    check('the table has several rows', n>=5, str(n))
    focused=lambda: pg.evaluate("()=>{const a=document.activeElement;const all=[...document.querySelectorAll('.placeholder-table input[placeholder=\"Enter value\"]')];return all.indexOf(a)}")
    boxes.nth(0).click(); check('first box focused', focused()==0)
    seq=[]
    for _ in range(n-1): pg.keyboard.press('Tab'); seq.append(focused())
    check('Tab goes to the next value box each time (not the delete icon)', seq==list(range(1,n)), str(seq))
    seq=[]
    for _ in range(n-1): pg.keyboard.press('Shift+Tab'); seq.append(focused())
    check('Shift+Tab goes back one value box at a time', seq==list(range(n-2,-1,-1)), str(seq))
    boxes.nth(1).fill('abc'); pg.keyboard.press('Tab'); pg.keyboard.press('Shift+Tab')
    sel=pg.evaluate("()=>{const a=document.activeElement;return a.value.length>0 && a.selectionStart===0 && a.selectionEnd===a.value.length}")
    check('the text of the box that is entered is selected', sel)
    boxes.nth(n-1).focus(); pg.keyboard.press('Tab'); pg.wait_for_timeout(200)
    check('Tab from the last box leaves the table', focused()==-1)
    boxes.nth(0).fill('Moon'); pg.wait_for_timeout(1300); pg.keyboard.press('Tab'); pg.wait_for_timeout(1300)
    check('typing then Tab keeps the value and moves on', focused()==1 and boxes.nth(0).input_value()=='Moon')
    check('no page errors', not errs, str(errs[:2]))
    print(f'RESULT {sum(R)} / {len(R)}')
