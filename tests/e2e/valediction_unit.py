import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import BASE_URL, PROJECT_ROOT
import sys, json, re
sys.path.insert(0,'.')
from playwright.sync_api import sync_playwright
BASE=BASE_URL+'/?pid=zz_val'
ED='[data-slate-editor="true"]'; U=ED+' .unit-leaf'
MODAL='.ant-modal:visible:has-text("Apply this change to other parts?")'
R=[]
def check(n,ok,d=''): R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+n,d,flush=True)
DRAFT="Subject: A note\n\nDear Vision,\n\nI love you and I am so sorry for everything.\n\nI hope we can talk soon.\n\nSincerely,\n\n[Your Name]  \n[Your Student ID]  \n[Course Name]"
SIGN="Sincerely,\n\n[Your Name]  \n[Your Student ID]  \n[Course Name]"
COMPS=[{"id":"subject_line","title":"Subject Line","content":"Subject: A note"},{"id":"opening_salutation","title":"Opening Salutation","content":"Dear Vision,"},
 {"id":"apology","title":"Apology","content":"I love you and I am so sorry for everything."},{"id":"call_to_action","title":"Call to Action","content":"I hope we can talk soon."},
 {"id":"valediction","title":"Valediction","content":SIGN}]
INTENTS=[{"dimension":"Level of Warmth","current_value":"Deeply affectionate","other_values":["Warm and caring","Polite and neutral","Brief and calm"]}]
LINKS=[{"intent_dimension":"Level of Warmth","component_id":c} for c in ("opening_salutation","apology","call_to_action","valediction")]
CHECKS=[]
def rewriter(route):
    d=json.loads(route.request.post_data); i=d['intentSelected']; vals=[i['current_value']]+i['other_values']
    cur=d['componentCurrent']
    def make(v):
        if 'Sincerely' in cur: return "Warm regards,\n\n[Your Name]  \n[Your Student ID]  \n[Course Name]"
        if cur.startswith('Dear Vision'): return "Hi Vision,"
        return f"{v}: {cur}"
    route.fulfill(status=200, content_type='application/json', body=json.dumps({'component_variations':[{'intent_value':v,'content':make(v)} for v in vals]}))
def consistency(route):
    CHECKS.append(1)
    targets=json.loads(route.request.post_data)['targets']
    route.fulfill(status=200, content_type='application/json', body=json.dumps({'results':[{'id':t['id'],'needs_change':True,'reason':''} for t in targets]}))
def paras(pg): return pg.evaluate("()=>[...document.querySelectorAll('[data-slate-editor=\"true\"] [data-slate-node=\"element\"]')].map(e=>e.innerText.trim()).filter(Boolean)")
def leaves(pg,uid): return pg.evaluate("(u)=>[...document.querySelectorAll('[data-unit=\"'+u+'\"]')].map(e=>({text:e.textContent,selected:e.classList.contains('unit-selected')}))", uid)
def use_first_card(pg):
    if not pg.locator('.vc-card').count(): pg.locator('.intentCards .ant-tag').first.click()
    pg.wait_for_function("document.querySelector('.vc-card')", timeout=60000); pg.wait_for_timeout(500)
    tags=[t.strip() for t in pg.locator('.vc-card .ant-tag').all_inner_texts()]
    i=next(k for k,t in enumerate(tags) if t!='Deeply affectionate')
    pg.locator('.vc-card').nth(i).get_by_role('button', name='Use').click()
MODAL='.ant-modal:visible:has-text("Apply this change to other parts?")'
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
    pg.fill('input[placeholder="Enter username"]','ZZVAL'); pg.press('input[placeholder="Enter username"]','Enter'); pg.wait_for_timeout(2500)
    pg.fill('textarea[placeholder^="Please input"]','Write a note to my ex.'); pg.locator('button').nth(1).click(); pg.wait_for_timeout(2500)
    pg.wait_for_function("(()=>{const m=document.body.innerText.match(/Email Components \\((\\d+)\\)/);return m&&parseInt(m[1])>0})()", timeout=120000)
    pg.wait_for_function("!document.querySelector('.draft-generating-page') && !document.querySelector('button.ant-btn-loading')", timeout=120000); pg.wait_for_timeout(1500)
    try: pg.get_by_text('Got it').click(timeout=5000)
    except Exception: pass
    check('0 the sign-off covers two paragraphs in the editor', len(leaves(pg,'valediction'))==2, str(leaves(pg,'valediction')))
    # 1. the component in the list is highlighted in the editor, over both paragraphs
    pg.get_by_text('Valediction', exact=True).first.click(); pg.wait_for_timeout(1500)
    check('1 clicking Valediction in the list highlights both paragraphs of it in the editor', [l['selected'] for l in leaves(pg,'valediction')]==[True,True], str(leaves(pg,'valediction')))
    # 2. Use a card: both paragraphs change, no window asks about other parts
    CHECKS.clear(); use_first_card(pg); pg.wait_for_timeout(5000)
    after=paras(pg)
    check('2 Use on a card changes the paragraphs of the valediction in the editor', 'Warm regards,' in after and 'Sincerely,' not in after and any('[Your Student ID]' in x for x in after), str(after[-3:]))
    check('2b the valediction is still one unit over its paragraphs', len(leaves(pg,'valediction'))>=2 and all(l['text'] for l in leaves(pg,'valediction')), str(leaves(pg,'valediction')))
    check('2c a change of the valediction is not carried to other parts: no window, no check', pg.locator(MODAL).count()==0 and len(CHECKS)==0, f'checks={len(CHECKS)}')
    # 3. after the use the unit can still be selected in the list
    pg.get_by_text('Opening Salutation', exact=True).first.click(); pg.wait_for_timeout(1200)
    pg.get_by_text('Valediction', exact=True).first.click(); pg.wait_for_timeout(1500)
    check('3 after a Use the valediction is highlighted again when it is clicked in the list', [l['selected'] for l in leaves(pg,'valediction')]==[True,True], str(leaves(pg,'valediction')))
    # 4. the opening salutation changes on its own too
    CHECKS.clear(); before=[x for x in paras(pg)]
    pg.get_by_text('Opening Salutation', exact=True).first.click(); pg.wait_for_timeout(1000)
    use_first_card(pg); pg.wait_for_timeout(5000)
    after=paras(pg)
    check('4 Use on the opening salutation changes it', 'Hi Vision,' in after and 'Dear Vision,' not in after, str(after[:2]))
    check('4b ... without a window or a check, and the valediction is left as it is', pg.locator(MODAL).count()==0 and len(CHECKS)==0 and 'Warm regards,' in after, f'checks={len(CHECKS)}')
    # 5. another unit: the window lists the units that follow, never the salutation or the valediction
    CHECKS.clear(); pg.get_by_text('Apology', exact=True).first.click(); pg.wait_for_timeout(1000)
    use_first_card(pg)
    pg.locator(MODAL).wait_for(timeout=30000); pg.wait_for_function("!document.querySelector('.ant-modal .ant-spin')", timeout=30000); pg.wait_for_timeout(500)
    names=[pg.locator('.propagation-item').nth(i).locator('strong').inner_text() for i in range(pg.locator('.propagation-item').count())]
    check('5 the window of another unit does not list the opening salutation or the valediction', names==['Call to Action'], str(names))
    check('5b the check was not asked about them', len(CHECKS)==1)
    pg.locator(MODAL).get_by_role('button', name='Skip').click(); pg.wait_for_timeout(500)
    check('no page errors', not errs, str(errs[:2]))
    print(f'RESULT {sum(R)} / {len(R)}')
