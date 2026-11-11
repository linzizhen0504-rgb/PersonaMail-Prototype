import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import BASE_URL, PROJECT_ROOT
import sys, json
sys.path.insert(0,'.')
from playwright.sync_api import sync_playwright
R=[]
def check(n,ok,d=''): R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+n,d,flush=True)
D="Subject: Question about [Course Name]\n\nHi [Professor's Name],\n\nI am in [Course Name & Section Number] and have a question.\n\nThanks,\n\n[Your Name]"
COMPS=[{"id":"all","title":"All","content":"I am in [Course Name & Section Number] and have a question."}]
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
    pg.goto(BASE_URL+'/?pid=zz_amp'); pg.wait_for_timeout(1500)
    pg.fill('input[placeholder="Enter username"]','ZZAMP'); pg.press('input[placeholder="Enter username"]','Enter'); pg.wait_for_timeout(2500)
    pg.fill('textarea[placeholder^="Please input"]','Write to my classmate.'); pg.locator('button').nth(1).click(); pg.wait_for_timeout(2500)
    pg.wait_for_function("(()=>{const m=document.body.innerText.match(/Email Components \\((\\d+)\\)/);return m&&parseInt(m[1])>0})()", timeout=120000)
    pg.wait_for_function("!document.querySelector('.draft-generating-page')", timeout=120000); pg.wait_for_timeout(1500)
    try: pg.get_by_text('Got it').click(timeout=5000)
    except Exception: pass
    rows=pg.locator('.placeholder-table tbody tr'); labs=[rows.nth(i).locator('td').first.inner_text().strip() for i in range(rows.count())]
    check('Course Name appears once and Section Number is its own row', labs==['[Course Name]','[Professor\'s Name]','[Section Number]','[Your Name]'], str(labs))
    box=lambda l: rows.nth(labs.index(l)).locator('input')
    box('[Course Name]').fill('Chemistry'); pg.wait_for_timeout(1300); t=pg.inner_text('[data-slate-editor="true"]')
    check('one value fills both places', t.count('Chemistry')==2 and 'Chemistry & [Section Number]' in t, t[:160].replace('\n',' | '))
    box('[Section Number]').fill('G2'); pg.wait_for_timeout(1300); t=pg.inner_text('[data-slate-editor="true"]')
    check('the other part of the bracket is filled too', 'Chemistry & G2' in t)
    box('[Course Name]').fill(''); pg.wait_for_timeout(1300); t=pg.inner_text('[data-slate-editor="true"]')
    check('emptying restores the bracket', '[Course Name]' in t and 'Course Name & G2' in t.replace('[Course Name]','Course Name') , t[:160].replace('\n',' | '))
    check('no page errors', not errs, str(errs[:2]))
    print(f'RESULT {sum(R)} / {len(R)}')
