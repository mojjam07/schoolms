"""Browser walkthrough for the attendance screens.

Setup (API on :4000 and `npm run dev` in client on :5173, migrated DB, an active admin):
  cd server && ADMIN_EMAIL=... ADMIN_PASSWORD=... npx tsx tests/seed-attendance.ts > /tmp/att-seed.json
  pip install playwright && playwright install chromium
  python3 e2e/attendance.walkthrough.py /tmp/att-seed.json
Screenshots go to ./e2e/shots/.
"""
import json, re, sys, os
from playwright.sync_api import sync_playwright, expect

S = json.load(open(sys.argv[1] if len(sys.argv) > 1 else '/tmp/att-seed.json'))
BASE = os.environ.get('BASE', 'http://localhost:5173')
os.makedirs('e2e/shots', exist_ok=True)
passed = failed = 0

def check(name, fn):
    global passed, failed
    try: fn(); passed += 1; print('PASS ', name)
    except Exception as e: failed += 1; print('FAIL ', name, '->', str(e).splitlines()[0][:200])

def login(p, email, w=1280, h=900):
    ctx = p.chromium.launch().new_context(viewport={'width': w, 'height': h}); page = ctx.new_page()
    page.goto(BASE + '/login'); page.get_by_label('Email').fill(email); page.get_by_label('Password').fill(S['password'])
    page.get_by_role('button', name='Sign in').click(); page.wait_for_url(re.compile(r'/(admin|teacher|student|parent)'))
    return page

with sync_playwright() as p:
    # ---------- form teacher ----------
    t = login(p, S['teacher'])
    t.goto(BASE + '/teacher/attendance/explanations')
    check('teacher sees the waiting explanation and a count on the tab', lambda: (expect(t.get_by_text('He had malaria')).to_be_visible(), expect(t.get_by_role('link', name=re.compile('Explanations'))).to_contain_text('1')))
    t.screenshot(path='e2e/shots/teacher-explanations.png')
    t.get_by_label('Reply to the parent (optional)').fill('Thank you, get well soon.')
    t.get_by_role('button', name='Accept', exact=True).click()
    check('accepting clears the queue and the tab count', lambda: (expect(t.get_by_text('Nothing is waiting for a reply.')).to_be_visible(), expect(t.get_by_role('link', name=re.compile('Explanations'))).not_to_contain_text('1')))
    t.get_by_role('button', name='Accepted', exact=True).click()
    check('the accepted one is listed with the reply', lambda: expect(t.get_by_text('Your reply: Thank you, get well soon.')).to_be_visible())
    t.goto(BASE + '/teacher/attendance/summary')
    def summary():
        row = t.get_by_role('row').filter(has_text='Bola')
        expect(row).to_contain_text('33.3%')  # present on 1 of 3 school days
        expect(row.locator('td').nth(5)).to_have_text('1')  # excused: the accepted explanation
        expect(t.get_by_role('row').filter(has_text='Ada')).to_contain_text('100%')
        expect(t.get_by_role('row').filter(has_text='Chidi')).to_contain_text('100%')  # late still counts as present
    check('class summary: Bola 33.3% with one excused, Ada 100%, Chidi (late once) 100%', summary)
    t.screenshot(path='e2e/shots/teacher-summary.png')
    t.goto(BASE + f"/teacher/attendance"); t.get_by_label('Date').fill(S['oldDay'])
    check('a form teacher is locked out of a register older than 7 days', lambda: expect(t.get_by_text('more than 7 days old')).to_be_visible())

    # ---------- a teacher who is not a form teacher ----------
    o = login(p, S['other'])
    o.goto(BASE + '/teacher/attendance/summary')
    check('a teacher with no class gets the plain explanation', lambda: expect(o.get_by_text('You are not the form teacher of any class')).to_be_visible())
    o.goto(BASE + '/teacher/attendance/explanations'); o.get_by_role('button', name='All', exact=True).click()
    check("another teacher never sees this class's explanations", lambda: expect(o.get_by_text('He had malaria')).to_have_count(0))

    # ---------- administrator ----------
    a = login(p, S['adminEmail'])
    a.goto(BASE + '/admin/attendance'); a.get_by_label('Date').fill(S['absentDay']); a.wait_for_load_state('networkidle')
    def day_overview():
        row = a.get_by_role('row').filter(has_text='JSS 1' + S['class1'])
        expect(row).to_contain_text('Taken'); expect(row).to_contain_text('Ngozi Form')
        expect(a.get_by_text('Registers taken').locator('..')).to_contain_text('of')
    check('admin overview: the seeded class shows Taken with its form teacher', day_overview)
    a.screenshot(path='e2e/shots/admin-overview.png')
    a.get_by_label('Date').fill(S['today']); a.wait_for_load_state('networkidle')
    check('admin overview: a day with no register shows Not taken', lambda: expect(a.get_by_role('row').filter(has_text='JSS 1' + S['class1'])).to_contain_text('Not taken'))
    a.get_by_role('row').filter(has_text='JSS 1' + S['class1']).get_by_role('link', name='Take register').click()
    check('Take register opens the register page on that class and day', lambda: (expect(a).to_have_url(re.compile('/admin/attendance/register')), expect(a.get_by_text('Not taken yet')).to_be_visible()))
    # take an old register (older than 7 days), which only the administrator may do
    a.get_by_label('Date').fill(S['oldDay'])
    sel = a.get_by_label('Class')
    opt = [o for o in sel.locator('option').all() if S['class1'] in o.inner_text() and 'JSS 1' in o.inner_text()][0]
    sel.select_option(value=opt.get_attribute('value'))
    expect(a.get_by_text('Not taken yet')).to_be_visible()
    a.get_by_label('Bola Pupil, Absent').check()
    a.get_by_role('button', name='Save register').click()
    check('admin can take a register 20 days old (and it is saved)', lambda: expect(a.get_by_text('Register saved.')).to_be_visible())
    a.screenshot(path='e2e/shots/admin-register.png')
    a.goto(BASE + '/admin/attendance/explanations')
    check('admin queue no longer lists this class once the form teacher has replied', lambda: expect(a.get_by_text('JSS 1' + S['class1'])).to_have_count(0))
    a.goto(BASE + '/admin/attendance/summary')
    check('admin class summary lists classes and terms', lambda: expect(a.get_by_label('Class')).to_be_visible())

    # ---------- student ----------
    s = login(p, S['ada'], 390, 800)
    s.goto(BASE + '/student/attendance')
    check('student sees their own figures, read only', lambda: (expect(s.get_by_text('School days').first).to_be_visible(), expect(s.get_by_text('100%').first).to_be_visible(), expect(s.get_by_role('button', name=re.compile('Explain'))).to_have_count(0)))
    s.screenshot(path='e2e/shots/student-phone.png')
    b = login(p, S['bola'])
    b.goto(BASE + '/student/attendance')
    check('a student with absences sees the days listed', lambda: expect(b.get_by_role('row').filter(has_text='Absent').first).to_be_visible())
    check('the student nav has an Attendance link', lambda: expect(b.get_by_role('link', name='Attendance')).to_be_visible())

    # ---------- report card ----------
    a.goto(BASE + f"/admin/results/{S['termId']}/{S['bolaId']}")
    check('report card preview shows the attendance block', lambda: (expect(a.get_by_label('Attendance').filter(has_text='School days')).to_be_visible()))
    a.screenshot(path='e2e/shots/report-card.png', full_page=True)

print(f'\n{passed} passed, {failed} failed'); sys.exit(1 if failed else 0)
