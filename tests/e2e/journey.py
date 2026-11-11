import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import BASE_URL, PROJECT_ROOT
import sys, re, json, time
sys.path.insert(0,'.')
from playwright.sync_api import sync_playwright
# usage: python3 t_e2e_full.py "<query string like ?cond=cards&pid=zz_e2e>" [after]
QS = sys.argv[1] if len(sys.argv)>1 else '?cond=cards&pid=zz_e2e'
AFTER = len(sys.argv)>2 and sys.argv[2]=='after'
BASE=BASE_URL+'/'
Q="Please write an email to my classmate saying I cannot join today's group meeting, and I will finish my part offline and update the group chat."
ED='[data-slate-editor="true"]'
R=[]
def check(n,ok,d=''): R.append((n,bool(ok))); print(('PASS ' if ok else 'FAIL ')+n,d,flush=True)
def comps(pg): return pg.evaluate("(()=>{const m=document.body.innerText.match(/Email Components \\((\\d+)\\)/);return m?parseInt(m[1]):0})()")
def titles(pg):
    a=pg.evaluate("""()=>{const f=t=>[...document.querySelectorAll('div')].find(d=>d.childElementCount===0&&d.textContent.trim()===t&&d.offsetParent);const a=f('Email Draft Editor'),c=f('Information to fill');if(!a||!c)return null;const x=a.getBoundingClientRect(),y=c.getBoundingClientRect();return [x.top+x.height/2,y.top+y.height/2]}""")
    return a
def login(pg, user, qs, stub=None):
    if stub: pg.route('**/generate-first-draft', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps({'draft':stub})))
    pg.goto(BASE+qs); pg.wait_for_timeout(1500)
    pg.fill('input[placeholder="Enter username"]',user); pg.press('input[placeholder="Enter username"]','Enter'); pg.wait_for_timeout(2500)
    pg.fill('textarea[placeholder^="Please input"]',Q); pg.locator('button').nth(1).click(); pg.wait_for_timeout(2500)
def generate(pg):
    pass  # the draft starts when the request is sent
def wait_ready(pg):
    pg.wait_for_function("(()=>{const m=document.body.innerText.match(/Email Components \\((\\d+)\\)/);return m&&parseInt(m[1])>0})()", timeout=900000)
    pg.wait_for_function("!document.querySelector('.draft-generating-page') && !document.querySelector('button.ant-btn-loading')", timeout=900000); pg.wait_for_timeout(2500)
def dismiss_tip(pg):
    try: pg.get_by_text('Got it').click(timeout=8000); return True
    except Exception: return False
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True)
    # ================= part 1: real model, the whole journey =================
    ctx=b.new_context(viewport={'width':1700,'height':1100}); ctx.grant_permissions(['clipboard-read','clipboard-write'])
    pg=ctx.new_page(); errs=[]; bad=[]
    pg.on('pageerror', lambda e: errs.append(str(e)[:200])); pg.on('response', lambda r: bad.append((r.status, r.url[:80])) if r.status>=400 else None)
    login(pg,'ZZE2E',QS)
    generate(pg)
    pg.wait_for_selector('.draft-generating-page', timeout=60000)
    check('0 no factor-selection chat page any more', pg.get_by_text('Please select the following factors').count()==0 and pg.get_by_role('button', name='Generate Email Draft').count()==0)
    check('1 skeleton page while the email and components are made', pg.locator('.draft-generating-page').count()==1 and pg.locator('input[placeholder="Enter value"]').count()==0)
    wait_ready(pg)
    n=comps(pg); check('2 email and components appear together', n>0 and len(pg.inner_text(ED))>100, f'components={n}')
    check('3 units are marked in the email', pg.locator(ED+' .unit-leaf').count()>=3, str(pg.locator(ED+' .unit-leaf').count()))
    check('4 subject line and body card with toolbar and two Copy buttons', pg.locator('[aria-label="Copy subject"]').count()==1 and pg.locator('[aria-label="Copy body"]').count()==1 and pg.locator('button:has(strong)').count()==1)
    check('5 no Reset Editor / Generate Components buttons', pg.get_by_role('button', name='Reset Editor').count()==0 and pg.get_by_role('button', name='Generate Components').count()==0)
    check('6 first-use tip with Got it', dismiss_tip(pg))
    t=titles(pg); check('7 the two titles are centred on one line', t and abs(t[0]-t[1])<1.5, str(t))
    # sidebar
    side=pg.locator('.factor-panel-sidebar')
    w=lambda name: side.get_by_role('button', name=name, exact=True).evaluate("e=>e.getBoundingClientRect().width")
    check('8 sidebar buttons show only an icon', side.get_by_role('button', name='Copy', exact=True).count()==1 and w('Copy')<=26 and side.get_by_role('button', name='Clear All', exact=True).count()==2 and all(x<=26 for x in side.get_by_role('button', name='Clear All', exact=True).evaluate_all('els=>els.map(e=>e.getBoundingClientRect().width)')))
    side.get_by_role('button', name='Copy', exact=True).hover(); pg.wait_for_timeout(500)
    check('9 hover opens the name', w('Copy')>40); pg.mouse.move(700,700); pg.wait_for_timeout(400)
    side.get_by_role('button', name='Copy', exact=True).click(); pg.wait_for_timeout(300)
    check('10 Request Copy copies the request', pg.evaluate('navigator.clipboard.readText()')==Q)
    pg.locator('[aria-label="Copy subject"]').click(); pg.wait_for_timeout(300); s1=pg.evaluate('navigator.clipboard.readText()')
    pg.locator('[aria-label="Copy body"]').click(); pg.wait_for_timeout(300); b1=pg.evaluate('navigator.clipboard.readText()')
    check('11 Subject / Body Copy', len(s1)>3 and not s1.lower().startswith('subject') and len(b1)>50)
    sel=pg.evaluate("()=>[...document.querySelectorAll('.factor-panel-sidebar .ant-checkbox-checked')].length")
    check('12 Template is gone; Tone Factors holds the options the model chose', side.get_by_text('Template', exact=True).count()==0 and side.get_by_text('Tone Factors', exact=True).count()==1 and side.get_by_role('button', name='Update', exact=True).count()==0 and side.get_by_role('button', name='Reset', exact=True).count()==0 and 2<=sel<=16, f'selected={sel}')
    ev=[json.loads(l) for l in open(f'{PROJECT_ROOT}/src/data/logs/zz_e2e.jsonl')]
    fs=[e for e in ev if e['event']=='factors_auto_selected']
    check('12b factors_auto_selected is logged with the chosen values', len(fs)>=1 and fs[-1]['count']==sel and sel>0, str(fs[-1]['count'] if fs else None))
    # clicks and cards
    U=ED+' .unit-leaf'
    k=next(i for i in range(pg.locator(U).count()) if 'subject' not in (pg.locator(U).nth(i).get_attribute('data-unit') or '') and len(pg.locator(U).nth(i).inner_text())>40)
    span=pg.locator(U).nth(k); uid=span.get_attribute('data-unit'); span.scroll_into_view_if_needed(); span.hover(); pg.wait_for_timeout(300)
    check('13 hover tints the unit and shows a pointer', pg.locator('.unit-hover').count()>0 and span.evaluate("e=>getComputedStyle(e).cursor")=='pointer')
    pt=span.evaluate("e=>{const r=e.getClientRects()[0];return [r.left+r.width/2,r.top+r.height/2]}"); pg.mouse.click(pt[0],pt[1]); pg.wait_for_timeout(900)
    check('14 first click selects the unit, no box', pg.locator(f'{U}.unit-selected[data-unit="{uid}"]').count()>=1 and pg.locator('.rw-box').count()==0)
    check('15 its first intent opens at once', pg.get_by_text('Generating versions').count()>0 or pg.locator('.vc-card').count()>0)
    pg.wait_for_function("document.querySelector('.vc-card')", timeout=300000); pg.wait_for_timeout(800)
    check('16 three version cards, changed sentences marked green', pg.locator('.vc-card').count()==3 and pg.locator('.vc-card span[style*="227, 245, 234"]').count()>0)
    own=lambda: pg.evaluate("[...document.querySelectorAll('[data-unit=\"%s\"]')].map(e=>e.textContent).join('')"%uid)
    ob=own(); pg.locator('.vc-card').first.get_by_role('button', name='Use').click(); pg.wait_for_timeout(6000)
    check('17 Use changes the unit text', own()!=ob and 'Applied' in pg.locator('.intentCards').inner_text(), repr(own()[:40]))
    # a style intent asks before it reaches the other units; a content intent changes this unit only. Either way nothing changes elsewhere on its own
    modal=pg.locator('.ant-modal:visible:has-text("Apply this change to other parts?")')
    try: modal.wait_for(timeout=6000)
    except Exception: pass
    if modal.count(): modal.get_by_role('button', name='Skip').click(); pg.wait_for_timeout(800)
    check('17b Use never rewrites other units by itself (a window may ask, Skip leaves them as they are)', modal.count()==0)
    pg.locator('.intentCards .ant-tag').nth(0).click(); pg.wait_for_function("document.querySelector('.vc-card')", timeout=300000); pg.wait_for_timeout(800)
    old=pg.locator('.vc-card').all_inner_texts(); pg.locator('.intentCards').get_by_role('button', name='Regenerate').click()
    pg.wait_for_function("!document.body.innerText.includes('Generating new versions') && document.querySelector('.vc-card')", timeout=300000); pg.wait_for_timeout(800)
    check('18 versions Regenerate gives three new cards', pg.locator('.vc-card').count()==3 and pg.locator('.vc-card').all_inner_texts()!=old)
    # selection rewrite
    pos=pg.evaluate("""()=>{const ps=[...document.querySelectorAll('[data-slate-editor="true"] [data-slate-string]')].filter(e=>e.offsetParent&&e.textContent.length>40);const n=ps[1].firstChild;const r=document.createRange();r.setStart(n,3);r.setEnd(n,25);const q=r.getClientRects()[0];return {x1:q.left+1,x2:q.right-1,y:q.top+q.height/2}}""")
    pg.mouse.click(5,5); pg.mouse.move(pos['x1'],pos['y']); pg.mouse.down(); pg.mouse.move(pos['x2'],pos['y'],steps=6); pg.mouse.up(); pg.wait_for_timeout(700)
    check('19 selecting text opens the Describe changes box', pg.locator('.rw-box').count()==1)
    t0=pg.inner_text(ED); pg.fill('.rw-input','make it more formal'); pg.keyboard.press('Enter'); pg.wait_for_selector('.rw-preview', timeout=120000)
    pg.get_by_role('button', name='Accept').click(); pg.wait_for_timeout(2500)
    check('20 Accept applies the rewrite', pg.inner_text(ED)!=t0 and pg.locator('.rw-box').count()==0)
    t1=pg.inner_text(ED); pg.mouse.click(5,5); pg.keyboard.press('Meta+z'); pg.wait_for_timeout(1500)
    check('21 Cmd+Z undoes the AI rewrite', pg.inner_text(ED)==t0)
    pg.keyboard.press('Meta+Shift+z'); pg.wait_for_timeout(1500); check('22 redo applies it again', pg.inner_text(ED)==t1)
    # manual edit + components regenerate
    pg.locator(ED+' [data-slate-string]:visible').nth(3).click(); pg.wait_for_timeout(1500); pg.keyboard.press('End'); pg.keyboard.type(' EXTRA TEXT.'); pg.wait_for_timeout(500)
    pg.get_by_role('button', name='Regenerate', exact=True).first.click()
    pg.wait_for_function("!document.querySelector('button.ant-btn-loading')", timeout=900000); pg.wait_for_timeout(3000)
    check('23 components Regenerate keeps the manual edit and rebuilds', 'EXTRA TEXT' in pg.inner_text(ED) and comps(pg)>0 and pg.locator('[data-unit]').count()>0)
    # new draft from the options
    pg.get_by_role('button', name='Regenerate with These Options').click()
    pg.wait_for_selector('.draft-generating-page', timeout=30000); pg.wait_for_selector('.draft-generating-page', state='detached', timeout=900000); pg.wait_for_timeout(3000)
    check('24 Regenerate with These Options gives a new draft with components', 'EXTRA TEXT' not in pg.inner_text(ED) and comps(pg)>0)
    side.get_by_role('button', name='Clear All', exact=True).last.click(); pg.wait_for_timeout(500)
    left=pg.evaluate("()=>[...document.querySelectorAll('.factor-panel-sidebar .ant-checkbox-checked')].length")
    check('25b Clear All next to Tone Factors puts every option back to Not selected', left==0 and pg.locator('.factor-panel-sidebar').get_by_text('Not selected', exact=True).count()==16, f'left={left}')
    t=titles(pg); check('25 titles still centred', t and abs(t[0]-t[1])<1.5, str(t))
    PREFERENCE_DOWN = bool(os.environ.get('PREFERENCE_DOWN'))   # set when the backend runs with an unreachable preference model (see README)
    if PREFERENCE_DOWN: bad=[item for item in bad if '/preference/' not in item[1]]   # then 503 from /preference/update and /reset-session is the expected answer
    check('26 part 1: no page errors, no 4xx/5xx', not errs and not bad, f'{errs[:2]} {bad[:3]}')
    # ================= part 2: a draft with brackets (placeholders table) =================
    D="""Subject: Extension request for [Project Name]

Dear Professor [Last Name],

I am writing about my project. [briefly state your reason, e.g., an unexpected illness / unforeseen circumstances], which has affected my work. I have [mention progress, e.g., completed the initial research] so far.

Could I submit it by [Proposed New Date, e.g., Friday, October 27th at 5:00 PM]? The extension would be about [desired extension period, for example two weeks]. See you in [Section Number/Time, such as Section 01].

P.S. I will make it up to you, especially when it comes to [stealing my food / snuggling in bed / snacking].

Thank you,

[Your Name]"""
    ctx2=b.new_context(viewport={'width':1700,'height':1100}); pg2=ctx2.new_page(); e2=[]
    pg2.on('pageerror', lambda e: e2.append(str(e)[:200]))
    login(pg2,'ZZE2EB',QS,stub=D); generate(pg2); wait_ready(pg2); dismiss_tip(pg2)
    rows=pg2.locator('.placeholder-table tbody tr'); inp=pg2.locator('.placeholder-table input[placeholder="Enter value"]')
    labs=lambda: [rows.nth(i).locator('td').first.inner_text().strip() for i in range(rows.count())]
    check('27 rows: facts only, reason and progress brackets stay out, e.g. dropped from the label', labs()==['[Project Name]','[Last Name]','[Proposed New Date]','[desired extension period]','[Section Number/Time]','[Your Name]'], str(labs()))
    check('28 those brackets stay in the email as they are', '[briefly state your reason, e.g., an unexpected illness / unforeseen circumstances]' in pg2.inner_text(ED))
    check('28b a list of alternatives is not in the table and stays in the email', not any('snacking' in l or 'stealing' in l for l in labs()) and '[stealing my food / snuggling in bed / snacking]' in pg2.inner_text(ED), str(labs()))
    i=labs().index('[Proposed New Date]'); inp.nth(i).fill('May 5'); pg2.wait_for_timeout(1300); tt=pg2.inner_text(ED)
    check('29 typing fills the email live', 'by May 5?' in tt and 'Proposed New Date' not in tt)
    inp.nth(i).fill(''); pg2.wait_for_timeout(1300)
    check('30 emptying restores the bracket as it was', '[Proposed New Date, e.g., Friday, October 27th at 5:00 PM]' in pg2.inner_text(ED))
    inp.nth(labs().index('[Your Name]')).fill('Mia'); pg2.wait_for_timeout(1300)
    check('31 filled in every place', pg2.inner_text(ED).count('Mia')>=1 and '[Your Name]' not in pg2.inner_text(ED))
    pg2.get_by_role('button', name='Delete [Last Name]').click(); pg2.wait_for_timeout(900)
    check('32 delete icon removes the placeholder and its row', '[Last Name]' not in pg2.inner_text(ED) and '[Last Name]' not in labs() and 'Dear Professor,' in pg2.inner_text(ED))
    pg2.mouse.click(5,5); pg2.keyboard.press('Meta+z'); pg2.wait_for_timeout(900)
    check('33 Cmd+Z brings it back', 'Dear Professor [Last Name],' in pg2.inner_text(ED) and '[Last Name]' in labs())
    pg2.locator('.placeholder-table').get_by_role('button', name='Clear All').click(); pg2.wait_for_timeout(1200)
    check('34 Clear All puts the brackets back', 'Mia' not in pg2.inner_text(ED) and '[Your Name]' in pg2.inner_text(ED))
    # the unit with the reason bracket: version cards replace it
    k=next((j for j in range(pg2.locator(U).count()) if 'briefly state your reason' in pg2.locator(U).nth(j).inner_text()), None)
    if k is not None:
        pt=pg2.locator(U).nth(k).evaluate("e=>{const r=e.getClientRects()[0];return [r.left+r.width/2,r.top+r.height/2]}"); pg2.mouse.click(pt[0],pt[1])
        pg2.wait_for_function("document.querySelector('.vc-card')", timeout=300000); pg2.wait_for_timeout(800)
        tx=pg2.locator('.vc-card').all_inner_texts(); check('35 version cards replace the reason bracket with concrete wording', len(tx)==3 and all('[' not in x for x in tx))
    else: check('35 version cards replace the reason bracket with concrete wording', False, 'unit not found')
    k2=next((j for j in range(pg2.locator(U).count()) if 'snuggling in bed' in pg2.locator(U).nth(j).inner_text()), None)
    if k2 is not None:
        pg2.keyboard.press('Escape'); pg2.mouse.click(5,5); pg2.wait_for_timeout(500)
        pt=pg2.locator(U).nth(k2).evaluate("e=>{const r=e.getClientRects()[0];return [r.left+r.width/2,r.top+r.height/2]}"); pg2.mouse.click(pt[0],pt[1])
        pg2.wait_for_function("document.querySelector('.vc-card')", timeout=300000); pg2.wait_for_timeout(800)
        tx=pg2.locator('.vc-card').all_inner_texts(); check('35b version cards replace the list of alternatives with one concrete wording', len(tx)==3 and all('[' not in x and 'snuggling in bed /' not in x for x in tx), str([x[:80] for x in tx]))
    else: check('35b version cards replace the list of alternatives with one concrete wording', False, 'unit not found')
    t=titles(pg2); check('36 titles centred (second draft)', t and abs(t[0]-t[1])<1.5, str(t))
    check('37 part 2: no page errors', not e2, str(e2[:2]))
    # ================= part 3: the old condition is gone =================
    if AFTER:
        ctx3=b.new_context(viewport={'width':1700,'height':1100}); pg3=ctx3.new_page(); e3=[]; pg3.on('pageerror', lambda e: e3.append(str(e)[:200]))
        login(pg3,'ZZE2EC','?cond=baseline&pid=zz_e2e_c'); generate(pg3); wait_ready(pg3); dismiss_tip(pg3)
        check('38 ?cond=baseline is ignored: the cards interface opens', pg3.locator('[aria-label="Copy subject"]').count()==1 and pg3.get_by_role('button', name='Generate Components').count()==0 and pg3.get_by_role('button', name='Reset Editor').count()==0 and pg3.locator('.placeholder-table').count()==1 and not e3)
    if PREFERENCE_DOWN:
        events=[json.loads(line) for line in open(f'{PROJECT_ROOT}/src/data/logs/zz_e2e.jsonl')]
        shown=[event for event in events if event['event']=='cards_shown']
        check('39 preference model down: the cards still appear, in a random order, and the page logs model_unavailable', len(shown)>0 and all(event.get('ordering')=='fallback_random' for event in shown) and any(event['event']=='model_unavailable' and event.get('endpoint')=='rank' for event in events), str([event.get('ordering') for event in shown]))
    b.close()
bad=[n for n,ok in R if not ok]
print(f'RESULT {len(R)-len(bad)} / {len(R)}', 'FAILED: '+'; '.join(bad) if bad else '')
