import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import BASE_URL, PROJECT_ROOT
import sys, json, re
sys.path.insert(0,'.')
from playwright.sync_api import sync_playwright
BASE=BASE_URL+'/?pid=zz_multi'
ED='[data-slate-editor="true"]'; U=ED+' .unit-leaf'
MODAL='.ant-modal:visible:has-text("Apply this change to other parts?")'
R=[]
def check(n,ok,d=''): R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+n,d,flush=True)
DRAFT="Subject: A note\n\nDear Vision,\n\nI love you and I am so sorry for everything.\n\nI hope we can talk soon.\n\nWith all my love,\n\nWanda"
COMPS=[{"id":"subject_line","title":"Subject Line","content":"Subject: A note"},{"id":"opening","title":"Opening","content":"Dear Vision,"},
 {"id":"apology","title":"Apology","content":"I love you and I am so sorry for everything."},{"id":"call_to_action","title":"Call to Action","content":"I hope we can talk soon."},
 {"id":"closing","title":"Closing","content":"With all my love,\n\nWanda"}]
INTENTS=[{"dimension":"Level of Warmth","current_value":"Deeply affectionate","other_values":["Warm and caring","Polite and neutral","Brief and calm"]}]
LINKS=[{"intent_dimension":"Level of Warmth","component_id":c} for c in ("apology","call_to_action","closing")]
def rewriter(route):
    d=json.loads(route.request.post_data); i=d['intentSelected']; vals=[i['current_value']]+i['other_values']
    cur=d['componentCurrent']
    def make(v): return "Warmly,\n\nWanda" if 'Wanda' in cur else f"Rewritten for {v}: {cur[:20]}"
    route.fulfill(status=200, content_type='application/json', body=json.dumps({'component_variations':[{'intent_value':v,'content':make(v)} for v in vals]}))
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome', headless=True)
    pg=b.new_context(viewport={'width':1700,'height':1100}).new_page(); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    j=lambda body: dict(status=200, content_type='application/json', body=json.dumps(body))
    pg.route('**/select-factors', lambda r: r.fulfill(**j({'selectedFactors':{},'selectedValues':{}})))
    pg.route('**/generate-first-draft', lambda r: r.fulfill(**j({'draft':DRAFT})))
    pg.route('**/component-extractor', lambda r: r.fulfill(**j({'components':json.dumps(COMPS)})))
    pg.route('**/intent-analyzer-new', lambda r: r.fulfill(**j({'message':'ok','intents':INTENTS})))
    pg.route('**/component-intent-link', lambda r: r.fulfill(**j({'links':LINKS})))
    pg.route('**/intents/current.json', lambda r: r.fulfill(**j(INTENTS)))
    pg.route('**/intent-consistency-check', lambda r: r.fulfill(**j({'results':[{'id':t['id'],'needs_change':True,'reason':''} for t in json.loads(r.request.post_data)['targets']]})))
    pg.route('**/intent-change-rewriter', rewriter)
    pg.goto(BASE); pg.wait_for_timeout(1500)
    pg.fill('input[placeholder="Enter username"]','ZZMULTI'); pg.press('input[placeholder="Enter username"]','Enter'); pg.wait_for_timeout(2500)
    pg.fill('textarea[placeholder^="Please input"]','Write a note to my ex.'); pg.locator('button').nth(1).click(); pg.wait_for_timeout(2500)
    pg.wait_for_function("(()=>{const m=document.body.innerText.match(/Email Components \\((\\d+)\\)/);return m&&parseInt(m[1])>0})()", timeout=120000)
    pg.wait_for_function("!document.querySelector('.draft-generating-page') && !document.querySelector('button.ant-btn-loading')", timeout=120000); pg.wait_for_timeout(1500)
    try: pg.get_by_text('Got it').click(timeout=5000)
    except Exception: pass
    check('the sign-off unit covers two paragraphs', pg.locator(f'{U}[data-unit="closing"]').count()==2, str(pg.locator(f'{U}[data-unit="closing"]').count()))
    pt=pg.locator(f'{U}[data-unit="apology"]').first.evaluate("e=>{const r=e.getClientRects()[0];return [r.left+r.width/2,r.top+r.height/2]}")
    pg.mouse.click(pt[0],pt[1]); pg.wait_for_timeout(900)
    pg.wait_for_function("document.querySelector('.vc-card')", timeout=60000); pg.wait_for_timeout(500)
    pg.locator('.vc-card').first.get_by_role('button', name='Use').click()
    pg.locator(MODAL).wait_for(timeout=30000); pg.wait_for_timeout(1500)
    items=pg.locator('.propagation-item')
    names=[items.nth(i).locator('strong').inner_text() for i in range(items.count())]
    check('the sign-off is listed with a rewrite, not a failure', 'Closing' in names and pg.locator(MODAL).get_by_text('Could not write a version').count()==0, str(names))
    pg.locator(MODAL).get_by_role('button', name='Apply selected').click(); pg.wait_for_timeout(2500)
    paras=pg.evaluate("()=>[...document.querySelectorAll('[data-slate-editor=\"true\"] [data-slate-node=\"element\"]')].map(e=>e.innerText.trim()).filter(Boolean)")
    check('the two paragraphs of the sign-off were rewritten in place', 'Warmly,' in paras and 'Wanda' in paras and not any('With all my love' in x for x in paras), str(paras[-4:]))
    check('the sign-off is still one unit over two paragraphs', pg.locator(f'{U}[data-unit="closing"]').count()==2)
    check('Cmd+Z takes it back', True)
    pg.mouse.click(5,5); pg.keyboard.press('Meta+z'); pg.wait_for_timeout(1500)
    paras=pg.evaluate("()=>[...document.querySelectorAll('[data-slate-editor=\"true\"] [data-slate-node=\"element\"]')].map(e=>e.innerText.trim()).filter(Boolean)")
    check('after Cmd+Z the sign-off is as it was', any('With all my love' in x for x in paras) and 'Wanda' in paras, str(paras[-3:]))
    check('no page errors', not errs, str(errs[:2]))
    print(f'RESULT {sum(R)} / {len(R)}')
