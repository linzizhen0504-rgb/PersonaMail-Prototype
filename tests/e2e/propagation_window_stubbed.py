import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import BASE_URL, PROJECT_ROOT
import sys, json, re
sys.path.insert(0,'.')
from playwright.sync_api import sync_playwright
BASE=BASE_URL+'/?pid=zz_pws'
ED='[data-slate-editor="true"]'; U=ED+' .unit-leaf'
MODAL='.ant-modal:visible:has-text("Apply this change to other parts?")'
R=[]
def check(n,ok,d=''): R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+n,d,flush=True)
MODE=['all']
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

def consistency(route):
    targets=json.loads(route.request.post_data)['targets']
    if MODE[0]=='fail': return route.fulfill(status=500, content_type='application/json', body='{"error":"x"}')
    flags=[(MODE[0]=='all') or (MODE[0]=='mixed' and i==0) for i,_ in enumerate(targets)]
    route.fulfill(status=200, content_type='application/json', body=json.dumps({'results':[{'id':t['id'],'needs_change':f,'reason':''} for t,f in zip(targets,flags)]}))
def unit_text(pg,uid): return pg.evaluate("[...document.querySelectorAll('[data-unit=\"%s\"]')].map(e=>e.textContent).join(' | ')"%uid)
def click_unit(pg,uid):
    pg.mouse.click(5,5); pg.wait_for_timeout(300)
    pt=pg.locator(f'{U}[data-unit="{uid}"]').first.evaluate("e=>{const r=e.getClientRects()[0];return [r.left+r.width/2,r.top+r.height/2]}")
    pg.mouse.click(pt[0],pt[1]); pg.wait_for_timeout(900)
def use_card(pg):
    """Use a version of the apology whose value is not the one the other units have (otherwise there is nothing to carry over)."""
    click_unit(pg,'apology')
    if not pg.locator('.vc-card').count(): pg.locator('.intentCards .ant-tag').first.click()  # the first click opens the cards only the first time
    pg.wait_for_function("document.querySelector('.vc-card')", timeout=60000); pg.wait_for_timeout(500)
    tags=[t.strip() for t in pg.locator('.vc-card .ant-tag').all_inner_texts()]
    i=next(k for k,t in enumerate(tags) if t!='Deeply affectionate')
    pg.locator('.vc-card').nth(i).get_by_role('button', name='Use').click()
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
    pg.route('**/intent-consistency-check', consistency)
    pg.route('**/intent-change-rewriter', rewriter)
    pg.goto(BASE); pg.wait_for_timeout(1500)
    pg.fill('input[placeholder="Enter username"]','ZZPWS'); pg.press('input[placeholder="Enter username"]','Enter'); pg.wait_for_timeout(2500)
    pg.fill('textarea[placeholder^="Please input"]','Write a note to my ex.'); pg.locator('button').nth(1).click(); pg.wait_for_timeout(2500)
    pg.wait_for_function("(()=>{const m=document.body.innerText.match(/Email Components \\((\\d+)\\)/);return m&&parseInt(m[1])>0})()", timeout=120000)
    pg.wait_for_function("!document.querySelector('.draft-generating-page') && !document.querySelector('button.ant-btn-loading')", timeout=120000); pg.wait_for_timeout(1500)
    try: pg.get_by_text('Got it').click(timeout=5000)
    except Exception: pass
    OTHERS=['call_to_action','closing']
    snap=lambda: {u:unit_text(pg,u) for u in OTHERS}
    # 1. some parts no longer fit: the window opens, nothing is written until the user answers
    MODE[0]='all'; before=snap(); use_card(pg); pg.locator(MODAL).wait_for(timeout=30000)
    check('1 the window opens at once', pg.locator(MODAL).count()==1)
    check('1b nothing else changed while the window is open', snap()==before)
    pg.wait_for_function("!document.querySelector('.ant-modal .ant-spin')", timeout=30000); pg.wait_for_timeout(300)
    items=pg.locator('.propagation-item')
    check('1c every other unit that shares the intent is listed, ticked', items.count()==2 and all(items.nth(i).locator('input[type=checkbox]').is_checked() for i in range(2)), str(items.count()))
    check('1d the new sentences are marked in green', pg.locator('.propagation-item span[style*="227, 245, 234"]').count()>0)
    items.nth(0).locator('input[type=checkbox]').uncheck(); pg.wait_for_timeout(200)
    check('1e Apply selected shows how many are ticked', pg.locator(MODAL).get_by_role('button', name='Apply selected (1)').count()==1)
    pg.locator(MODAL).get_by_role('button', name='Apply selected').click(); pg.wait_for_timeout(2000)
    after=snap()
    check('1f the window closes and only the ticked unit changed', pg.locator(MODAL).count()==0 and after['call_to_action']==before['call_to_action'] and after['closing']!=before['closing'], str(after))
    pg.mouse.click(5,5); pg.keyboard.press('Meta+z'); pg.wait_for_timeout(1500)
    check('1g Cmd+Z takes it back', snap()==before)
    # 2. Skip changes nothing
    MODE[0]='all'; before=snap(); use_card(pg); pg.locator(MODAL).wait_for(timeout=30000)
    pg.locator(MODAL).get_by_role('button', name='Skip').click(); pg.wait_for_timeout(1200)
    check('2 Skip changes nothing in the other units', pg.locator(MODAL).count()==0 and snap()==before)
    # 3. only one part no longer fits: all are listed, that one is ticked
    MODE[0]='mixed'; use_card(pg); pg.locator(MODAL).wait_for(timeout=30000); pg.wait_for_timeout(800)
    items=pg.locator('.propagation-item')
    ticked=[items.nth(i).locator('input[type=checkbox]').is_checked() for i in range(items.count())]
    check('3 every sharing unit is listed; only the one that no longer fits is ticked', ticked==[True,False], str(ticked))
    pg.locator(MODAL).get_by_role('button', name='Skip').click(); pg.wait_for_timeout(800)
    # 4. every part still fits: no window, nothing changes
    MODE[0]='none'; before=snap(); use_card(pg); pg.wait_for_timeout(4000)
    check('4 when every other part still fits there is no window and nothing changes', pg.locator(MODAL).count()==0 and snap()==before)
    check('4b the notice says they already fit', 'already fit' in pg.locator('.intentCards').inner_text())
    # 5. the check fails: every sharing unit is offered
    MODE[0]='fail'; use_card(pg); pg.locator(MODAL).wait_for(timeout=30000); pg.wait_for_timeout(800)
    check('5 when the check fails every sharing unit is offered', pg.locator('.propagation-item').count()==2)
    pg.locator(MODAL).get_by_role('button', name='Skip').click(); pg.wait_for_timeout(500)
    check('no page errors', not errs, str(errs[:2]))
    print(f'RESULT {sum(R)} / {len(R)}')
