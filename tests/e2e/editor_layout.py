import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import BASE_URL, PROJECT_ROOT
import sys, json, re
sys.path.insert(0,'.')
from playwright.sync_api import sync_playwright
BASE=BASE_URL+'/?pid=zz_lay'
ED='[data-slate-editor="true"]'; U=ED+' .unit-leaf'
MODAL='.ant-modal:visible:has-text("Apply this change to other parts?")'
R=[]
def check(n,ok,d=''): R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+n,d,flush=True)
DRAFT="Subject: A note\n\nDear Vision,\n\nI love you and I am so sorry for everything.\n\nI hope we can talk soon.\n\nWith all my love,\n\nWanda"
COMPS=[{"id":"subject_line","title":"Subject Line","content":"Subject: A note"},{"id":"opening","title":"Opening","content":"Dear Vision,"},
 {"id":"apology","title":"Apology","content":"I love you and I am so sorry for everything."},{"id":"call_to_action","title":"Call to Action","content":"I hope we can talk soon."},
 {"id":"valediction","title":"Valediction","content":"With all my love,\n\nWanda"}]
INTENTS=[{"dimension":"Level of Warmth","current_value":"Deeply affectionate","other_values":["Warm and caring","Polite and neutral","Brief and calm"]}]
LINKS=[{"intent_dimension":"Level of Warmth","component_id":c} for c in ("apology","call_to_action","valediction")]
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
    pg.fill('input[placeholder="Enter username"]','ZZLAY'); pg.press('input[placeholder="Enter username"]','Enter'); pg.wait_for_timeout(2500)
    pg.fill('textarea[placeholder^="Please input"]','Write a note to my ex.'); pg.locator('button').nth(1).click(); pg.wait_for_timeout(2500)
    pg.wait_for_function("(()=>{const m=document.body.innerText.match(/Email Components \\((\\d+)\\)/);return m&&parseInt(m[1])>0})()", timeout=120000)
    pg.wait_for_function("!document.querySelector('.draft-generating-page') && !document.querySelector('button.ant-btn-loading')", timeout=120000); pg.wait_for_timeout(1500)
    try: pg.get_by_text('Got it').click(timeout=5000)
    except Exception: pass
    boxes=pg.evaluate("""()=>{
      const r=e=>{if(!e)return null;const b=e.getBoundingClientRect();return {top:Math.round(b.top),height:Math.round(b.height),bottom:Math.round(b.bottom),left:Math.round(b.left),right:Math.round(b.right)}};
      const centre=t=>{const e=[...document.querySelectorAll('div')].find(d=>d.childElementCount===0&&d.textContent.trim()===t&&d.offsetParent);if(!e)return null;const b=e.getBoundingClientRect();return b.top+b.height/2};
      const subject=document.querySelector('.subject-row');
      const copy=subject&&[...subject.querySelectorAll('button')].pop();
      return {
        scroller:r(document.querySelector('.email-scroll')), card:r(document.querySelector('.email-editor-card')),
        intents:r(document.querySelector('.intentCards')), subject:r(subject), copy:r(copy),
        toolbarH1:r([...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='H1')),
        cardBg:r(document.querySelector('.card-bg')), titles:[centre('Email Draft Editor'),centre('Information to fill')],
        titleBox:r([...document.querySelectorAll('div')].find(d=>d.childElementCount===0&&d.textContent.trim()==='Email Draft Editor'&&d.offsetParent)),
        components:r(document.querySelector('.components-panel')||[...document.querySelectorAll('div')].find(d=>/^Email Components/.test(d.textContent.trim())&&d.childElementCount<=2&&d.offsetParent))
      }}""")
    # what the layout was before the body got more room (1700x1100): the body frame started 16px under the card, the subject row was
    # 44px high with 20px under it, the white body card 399px high; the intents began at 682 and the card ended at 809
    BEFORE={'toolbarH1Top':229,'cardBgHeight':399,'intentsTop':682,'intentsBottom':808,'cardBottom':809,'scrollerBottom':620}
    check('1 the body card is higher: it starts 40px or more further up', boxes['toolbarH1']['top']<=BEFORE['toolbarH1Top']-40, str(boxes['toolbarH1']))
    check('2 the white body card has 40px or more extra height', boxes['cardBg']['height']>=BEFORE['cardBgHeight']+40, str(boxes['cardBg']))
    check('2b the editor box (with the email components) starts close under the title: at most 10px of white', 0<=boxes['card']['top']-boxes['titleBox']['bottom']<=10, f"card {boxes['card']['top']} title bottom {boxes['titleBox']['bottom']}")
    check('2c the email components panel reaches the top of the box too', boxes['components'] is not None and boxes['components']['top']<=boxes['card']['top']+60, str(boxes['components']))
    check('3 the intents did not move or shrink', abs(boxes['intents']['top']-BEFORE['intentsTop'])<=1 and abs(boxes['intents']['bottom']-BEFORE['intentsBottom'])<=1, str(boxes['intents']))
    check('4 the card and the body area end where they ended', abs(boxes['card']['bottom']-BEFORE['cardBottom'])<=1 and abs(boxes['scroller']['bottom']-BEFORE['scrollerBottom'])<=1, f"{boxes['card']} {boxes['scroller']}")
    check('5 the subject row is lower than before but not cramped, and its Copy button is inside it', 30<=boxes['subject']['height']<=36 and boxes['copy']['top']>=boxes['subject']['top']-1 and boxes['copy']['bottom']<=boxes['subject']['bottom']+1, f"{boxes['subject']} {boxes['copy']}")
    t=boxes['titles']
    check('6 Email Draft Editor and Information to fill are centred on one line', t[0] is not None and t[1] is not None and abs(t[0]-t[1])<1.5, str(t))
    check('6b both titles are 10px or more higher than they were (their centre was at 108)', t[0] is not None and t[1] is not None and max(t)<=108-10, str(t))
    # a long email: the body scrolls inside its area and the intents stay put
    pg.evaluate("document.querySelector('.email-scroll').scrollTop=100000"); pg.wait_for_timeout(300)
    after=pg.evaluate("(()=>{const b=document.querySelector('.intentCards').getBoundingClientRect();return Math.round(b.top)})()")
    check('7 scrolling the body does not move the intents', abs(after-BEFORE['intentsTop'])<=1, str(after))
    check('no page errors', not errs, str(errs[:2]))
    print(f'RESULT {sum(R)} / {len(R)}')
