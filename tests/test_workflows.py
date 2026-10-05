import importlib.util
from datetime import date,timedelta
from pathlib import Path
import json
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def ctx(tmp_path,monkeypatch):
    monkeypatch.setenv('WORKBENCH_DB',str(tmp_path/'test.sqlite3'))
    monkeypatch.delenv('OLLAMA_MODEL',raising=False)
    spec=importlib.util.spec_from_file_location('workbench_test',Path(__file__).parents[1]/'backend'/'main.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module,TestClient(module.app)

def post(c,path,p=None):
    if path=='knowledge/ask':p={'retrieval':'keyword',**(p or {})}
    return c.post('/api/'+path,json=p or {})
def state(c):return c.get('/api/state').json()
def test_seed_is_idempotent_and_valid(ctx):
    m,c=ctx;m.seed();s=state(c)
    assert len(s['clients'])==3
    assert all(all(d['received'] for d in x['documents']) for x in s['clients'] if x['stage']=='Active')
def test_onboarding_requires_documents(ctx):
    _,c=ctx
    assert post(c,'clients/c2/stage',{'stage':'Active'}).status_code==409
    for i in range(3):assert post(c,'clients/c2/document',{'index':i,'received':True}).status_code==200
    assert post(c,'clients/c2/stage',{'stage':'Active'}).status_code==200
    post(c,'clients/c2/document',{'index':1,'received':False})
    assert next(x for x in state(c)['clients'] if x['id']=='c2')['stage']=='Onboarding'
def test_drafts_are_idempotent_and_never_sent(ctx):
    _,c=ctx
    a=post(c,'clients/c2/reminder').json();b=post(c,'clients/c2/reminder').json()
    assert a['id']==b['id'] and b['existing']
    assert post(c,'drafts/'+a['id']+'/approve').json()['sent'] is False
    assert state(c)['drafts'][0]['status']=='Reviewed'
def test_batch_idempotency(ctx):
    _,c=ctx
    a=post(c,'automations/followups').json();b=post(c,'automations/followups').json()
    assert a['created']>=1 and b['created']==0 and a['sent']==0
    assert b['reused']==a['created']
def test_duplicate_payables_block_until_rejected(ctx):
    _,c=ctx
    assert post(c,'invoices/ap1/approve').status_code==409
    assert post(c,'invoices/ap2/reject').status_code==200
    assert post(c,'invoices/ap1/approve').status_code==200
    assert post(c,'invoices/ap1/approve').status_code==409
    assert post(c,'invoices/ar1/approve').status_code==409

def test_matches_require_review_and_are_one_to_one(ctx):
    _,c=ctx;s=state(c)
    assert len(next(b for b in s['bank'] if b['id']=='b3')['candidates'])==2
    assert not next(b for b in s['bank'] if b['id']=='b3')['match']
    assert post(c,'matches',{'bank_id':'b1','ledger_id':'l2'}).status_code==422
    assert post(c,'matches',{'bank_id':'b1','ledger_id':'l1'}).status_code==200
    assert post(c,'matches',{'bank_id':'b1','ledger_id':'l1'}).status_code==409
    assert post(c,'matches/b1/undo').status_code==200
    assert post(c,'matches/b1/undo').status_code==409

def test_match_currency_and_date_boundaries(ctx):
    _,c=ctx
    tx={'id':'l-usd','description':'Test','reference':'INV-1042','amount_cents':240000,'currency':'USD','txn_date':'2026-10-01'}
    assert post(c,'transactions/import',{'target':'ledger','transactions':[tx]}).status_code==200
    assert post(c,'matches',{'bank_id':'b1','ledger_id':'l-usd'}).status_code==422
    tx.update(id='l-late',currency='CAD',txn_date='2026-10-20')
    post(c,'transactions/import',{'target':'ledger','transactions':[tx]})
    assert post(c,'matches',{'bank_id':'b1','ledger_id':'l-late'}).status_code==422

def test_import_is_atomic_and_repeatable(ctx):
    _,c=ctx
    tx={'id':'b-test','description':'Test','reference':'ABC','amount_cents':12345,'currency':'CAD','txn_date':'2026-10-01'}
    assert post(c,'transactions/import',{'target':'bank','transactions':[tx]}).json()['imported']==1
    assert post(c,'transactions/import',{'target':'bank','transactions':[tx]}).json()['skipped']==1
    new={**tx,'id':'b-new'};bad={**tx,'amount_cents':12346}
    assert post(c,'transactions/import',{'target':'bank','transactions':[new,bad]}).status_code==409
    assert all(b['id']!='b-new' for b in state(c)['bank'])

def test_input_validation_and_job_totals(ctx):
    _,c=ctx
    p={'job_id':'j1','staff':'Jamie','minutes':90,'work_date':date.today().isoformat(),'note':'Review'}
    before=next(j for j in state(c)['jobs'] if j['id']=='j1')['used_minutes']
    assert post(c,'time',p).status_code==200
    assert next(j for j in state(c)['jobs'] if j['id']=='j1')['used_minutes']==before+90
    assert post(c,'time',{**p,'minutes':-1}).status_code==422
    assert post(c,'time',{**p,'minutes':1500}).status_code==422
    assert post(c,'time',{**p,'minutes':1440}).status_code==422
    assert post(c,'time',{**p,'work_date':(date.today()+timedelta(days=1)).isoformat()}).status_code==422
    assert post(c,'invoices',{'kind':'AP','party':'Test','reference':'x','amount_cents':1.5,'due_date':'2026-10-01'}).status_code==422
    assert post(c,'clients',{'name':'AA','email':'bad','service':'Books'}).status_code==422

def test_knowledge_segregates_jurisdiction_and_year(ctx):
    _,c=ctx
    p={'question':'What documents are required for onboarding?','jurisdiction':'CA','tax_year':2026}
    assert post(c,'knowledge/ask',p).json()['citations'][0]['id']=='s1'
    assert post(c,'knowledge/ask',{**p,'jurisdiction':'US'}).json()['citations']==[]
    assert post(c,'knowledge/ask',{**p,'tax_year':2025}).json()['citations']==[]
    assert post(c,'knowledge/ask',{**p,'question':'Capital gains rate?'}).json()['citations']==[]
    assert post(c,'knowledge/ask',{**p,'use_model':True}).status_code==503

def test_unapproved_source_not_retrieved(ctx):
    _,c=ctx
    p={'title':'Unreviewed sample','body':'Sample instructions about pineapples and demonstrations.','jurisdiction':'US','tax_year':2026,'approved':False}
    assert post(c,'sources',p).status_code==200
    assert post(c,'knowledge/ask',{'question':'pineapples','jurisdiction':'US','tax_year':2026}).json()['citations']==[]

def test_local_model_success_and_bad_citation(ctx,monkeypatch):
    m,c=ctx;monkeypatch.setenv('OLLAMA_MODEL','test-only')
    class Reply:
        def __enter__(self):return self
        def __exit__(self,*a):pass
        def read(self,*a):return json.dumps({'message':{'content':'Collect the engagement letter. [s1]'}}).encode()
    monkeypatch.setattr(m.urllib.request,'urlopen',lambda *a,**k:Reply())
    p={'question':'Onboarding documents','jurisdiction':'CA','tax_year':2026,'use_model':True}
    assert post(c,'knowledge/ask',p).json()['mode'].startswith('Local AI draft')
    Reply.read=lambda *a:json.dumps({'message':{'content':'An unsupported answer [invented]'}}).encode()
    assert 'withheld' in post(c,'knowledge/ask',p).json()['mode']

def test_origin_and_content_type_guard(ctx):
    _,c=ctx
    assert c.post('/api/clients',json={},headers={'origin':'https://untrusted.example'}).status_code==403
    assert c.post('/api/clients',content='{}',headers={'content-type':'text/plain'}).status_code==415

def test_changes_persist_and_audit(ctx):
    m,c=ctx
    x=post(c,'clients',{'name':'New sample','email':'a@example.test','service':'Books'}).json()
    with m.database() as db:assert m.one(db,'clients',x['id'])['name']=='New sample'
    assert state(c)['audit'][0]['action']=='Client created'
    assert c.get('/api/export').status_code==200

def sender_module(m,monkeypatch):
    import sys
    monkeypatch.setitem(sys.modules,'main',m)
    spec=importlib.util.spec_from_file_location('sender_test',Path(__file__).parents[1]/'backend'/'send_reviewed.py')
    sender=importlib.util.module_from_spec(spec);spec.loader.exec_module(sender)
    return sender

def test_email_defaults_to_dry_run(ctx,monkeypatch):
    m,c=ctx;s=sender_module(m,monkeypatch)
    d=post(c,'clients/c2/reminder').json()['id'];post(c,'drafts/'+d+'/approve')
    monkeypatch.setattr(s.smtplib,'SMTP_SSL',lambda *a,**k:pytest.fail('Dry-run must not open SMTP'))
    assert s.send_reviewed(d)[0]['action']=='dry-run; nothing sent'
    with pytest.raises(ValueError):s.send_reviewed(d,True)
    with pytest.raises(ValueError):s.valid_address('person@example.com')

def smtp_fixture(m,c,s,monkeypatch):
    ident=post(c,'clients/c2/reminder').json()['id'];post(c,'drafts/'+ident+'/approve')
    with m.database(True) as db:db.execute('UPDATE drafts SET recipient=? WHERE id=?',('client@firm.internal',ident))
    for k,v in {'SMTP_ENABLED':'true','SMTP_HOST':'smtp.internal','SMTP_USERNAME':'test','SMTP_PASSWORD':'test','SMTP_FROM':'sender@firm.internal'}.items():monkeypatch.setenv(k,v)
    return ident

def test_mock_smtp_success_not_resent(ctx,monkeypatch):
    m,c=ctx;s=sender_module(m,monkeypatch);ident=smtp_fixture(m,c,s,monkeypatch)
    class SMTP:
        def __enter__(self):return self
        def __exit__(self,*a):pass
        def login(self,*a):pass
        def send_message(self,msg):return {}
    monkeypatch.setattr(s.smtplib,'SMTP_SSL',lambda *a,**k:SMTP())
    assert 'accepted' in s.send_reviewed(ident,True)[0]['action']
    assert state(c)['drafts'][0]['status']=='Sent'
    with pytest.raises(ValueError):s.send_reviewed(ident,True)

def test_mock_smtp_uncertain_outcome_needs_review(ctx,monkeypatch):
    m,c=ctx;s=sender_module(m,monkeypatch);ident=smtp_fixture(m,c,s,monkeypatch)
    def broken(*a,**k):raise TimeoutError()
    monkeypatch.setattr(s.smtplib,'SMTP_SSL',broken)
    with pytest.raises(RuntimeError):s.send_reviewed(ident,True)
    assert state(c)['drafts'][0]['status']=='Needs review'
    with pytest.raises(ValueError):s.send_reviewed(ident,True)

@pytest.fixture
def hosted(tmp_path,monkeypatch):
    monkeypatch.setenv('PUBLIC_DEMO','true')
    monkeypatch.setenv('SESSION_SECRET','test-secret-only-not-for-deployment-1234567890')
    monkeypatch.setenv('WORKBENCH_DB',str(tmp_path/'public.sqlite3'))
    spec=importlib.util.spec_from_file_location('hosted_test',Path(__file__).parents[1]/'backend'/'main.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module,TestClient(module.app,base_url='https://testserver'),TestClient(module.app,base_url='https://testserver')

def test_public_demo_isolates_visitors(hosted):
    _,a,b=hosted
    assert state(a)['public_demo'] is True
    state(b)
    created=post(a,'clients',{'name':'Visitor A only','email':'a@example.test','service':'Demo'}).json()['id']
    assert any(x['id']==created for x in state(a)['clients'])
    assert all(x['id']!=created for x in state(b)['clients'])
    assert post(b,'clients/'+created+'/stage',{'stage':'Onboarding'}).status_code==404

def test_public_demo_cookie_and_access_guards(hosted):
    _,a,b=hosted
    assert post(a,'clients',{}).status_code==403
    r=a.get('/api/state')
    assert 'Secure' in r.headers['set-cookie'] and 'HttpOnly' in r.headers['set-cookie']
    assert r.headers['cache-control']=='no-store'
    assert post(a,'knowledge/ask',{'question':'onboarding documents','jurisdiction':'CA','tax_year':2026,'use_model':True}).status_code==503
    b.cookies.set('workbench_session','0'*32+'.forged')
    assert post(b,'automations/followups').status_code==403
    assert a.post('/api/automations/followups',json={},headers={'origin':'https://evil.example'}).status_code==403
    assert a.get('/api/health').json()['status']=='ok'

def test_public_demo_rate_limit(hosted):
    m,a,b=hosted
    state(a)
    ident=m.session_id(a.cookies.get('workbench_session'))
    m.RATE_BUCKETS[ident].extend([m.time.monotonic()]*90)
    assert a.get('/api/state').status_code==429
    assert b.get('/api/state').status_code==200

def test_rollout_requires_evidence_and_known_item(ctx):
    _,c=ctx
    assert post(c,'rollout/crm',{'status':'Verified','note':''}).status_code==422
    assert post(c,'rollout/unknown',{'status':'In progress'}).status_code==404
    assert post(c,'rollout/crm',{'status':'Verified','note':'Sample checklist reviewed by demo owner.'}).status_code==200
    assert post(c,'rollout/crm',{'status':'In progress','note':'Retesting changes.'}).status_code==200
    assert len(state(c)['rollout'])==1
    assert state(c)['rollout'][0]['status']=='In progress'

def test_pilot_measurements_preserve_negative_results(ctx):
    _,c=ctx
    p={'title':'Document follow-ups','area':'CRM','weekly_runs':5,'before_minutes':10,'after_minutes':15,'evidence':'Five sample runs including review time.'}
    assert post(c,'improvements',p).status_code==200
    x=state(c)['improvements'][0]
    assert (x['before_minutes']-x['after_minutes'])*x['weekly_runs']==-25
    assert post(c,'improvements',{**p,'weekly_runs':0}).status_code==422
    assert post(c,'improvements',{**p,'before_minutes':-1}).status_code==422
    assert post(c,'improvements',{**p,'area':'Invalid'}).status_code==422

def test_operations_workflow_retry_and_review_boundary(ctx):
    _,c=ctx
    first=post(c,'workflows/operations',{'run_key':'daily:2026-10-05'}).json()
    repeated=post(c,'workflows/operations',{'run_key':'daily:2026-10-05'}).json()
    assert repeated['replayed'] and first['run_id']==repeated['run_id']
    assert first['sent']==0 and first['followups']['created']>0
    assert {'Onboarding','Payables','Reconciliation'}.issubset({x['area'] for x in first['exceptions']})
    assert len(state(c)['workflow_runs'])==1
    assert all(x['status']=='Review' for x in state(c)['invoices'] if x['kind']=='AP')
    assert not any(x['match'] for x in state(c)['bank'])
    next_run=post(c,'workflows/operations',{'run_key':'second-run'}).json()
    assert next_run['followups']['created']==0
    assert next_run['followups']['reused']==first['followups']['created']

def test_operations_workflow_atomic_failure(ctx,monkeypatch):
    m,c=ctx
    def fail(*args):raise RuntimeError('simulated failure')
    monkeypatch.setattr(m,'candidates',fail)
    with pytest.raises(RuntimeError):post(c,'workflows/operations',{'run_key':'rollback-check'})
    with m.database() as db:
        assert db.execute('SELECT COUNT(*) FROM workflow_runs').fetchone()[0]==0
        assert db.execute('SELECT COUNT(*) FROM drafts').fetchone()[0]==0

def simulated_agent(m,monkeypatch,invalid=False):
    monkeypatch.setenv('OLLAMA_MODEL','test-model')
    calls=iter([m.AgentStep(action='read',area='invoices'),m.AgentStep(action='finish',summary='Review possible duplicate bills.',recommendations=['Compare supplier records before approving.'],evidence_ids=['invoices:invented' if invalid else 'invoices:ap1'])])
    monkeypatch.setattr(m,'agent_model',lambda messages:next(calls))

def test_ai_investigation_and_review(ctx,monkeypatch):
    m,c=ctx;simulated_agent(m,monkeypatch)
    run=post(c,'workflows/operations',{'run_key':'ai-test'}).json()['run_id']
    review=post(c,'workflows/'+run+'/investigate').json()['id']
    assert state(c)['agent_reviews'][0]['status']=='Awaiting review'
    assert post(c,'agent-reviews/'+review+'/decision',{'decision':'Approved','reviewer':'Test accountant','note':'Compared the sample supplier invoice records.'}).json()['executed'] is False
    assert post(c,'agent-reviews/'+review+'/decision',{'decision':'Approved','reviewer':'Test accountant','note':'Compared the sample supplier invoice records.'}).status_code==409
    assert all(x['status']=='Review' for x in state(c)['invoices'] if x['kind']=='AP')

def test_ai_fabricated_evidence_is_withheld(ctx,monkeypatch):
    m,c=ctx;simulated_agent(m,monkeypatch,True)
    run=post(c,'workflows/operations',{'run_key':'bad-ai-test'}).json()['run_id']
    assert post(c,'workflows/'+run+'/investigate').status_code==502
    assert state(c)['agent_reviews'][0]['status']=='Failed'

def test_ai_stale_proposal_cannot_be_approved(ctx,monkeypatch):
    m,c=ctx;simulated_agent(m,monkeypatch)
    run=post(c,'workflows/operations',{'run_key':'stale-ai-test'}).json()['run_id']
    review=post(c,'workflows/'+run+'/investigate').json()['id']
    post(c,'clients',{'name':'Changed client','email':'test@example.com','service':'Accounting'})
    assert post(c,'agent-reviews/'+review+'/decision',{'decision':'Approved','reviewer':'Accountant','note':'Reviewed before source changes.'}).status_code==409
    assert post(c,'agent-reviews/'+review+'/decision',{'decision':'Rejected','reviewer':'Accountant','note':'Source records have changed.'}).status_code==200

def test_ai_requires_model(ctx):
    _,c=ctx
    run=post(c,'workflows/operations',{'run_key':'no-ai-test'}).json()['run_id']
    assert post(c,'workflows/'+run+'/investigate').status_code==503

def test_cloud_configuration_and_shared_quota(ctx,monkeypatch,tmp_path):
    m,c=ctx
    monkeypatch.setenv('AI_PROVIDER','ollama-cloud')
    monkeypatch.setenv('OLLAMA_MODEL','test-cloud')
    monkeypatch.delenv('OLLAMA_API_KEY',raising=False)
    assert not m.agent_configured()
    monkeypatch.setenv('OLLAMA_API_KEY','test-secret')
    monkeypatch.setattr(m,'PUBLIC_DEMO',True)
    assert m.agent_configured()
    monkeypatch.setenv('AI_DAILY_REVIEW_LIMIT','2')
    monkeypatch.setenv('AI_VISITOR_DAILY_LIMIT','1')
    m.reserve_cloud_review()
    with pytest.raises(m.HTTPException) as err:m.reserve_cloud_review()
    assert err.value.status_code==429
    token=m.ACTIVE_DB.set(tmp_path/'other.sqlite3')
    try:m.reserve_cloud_review()
    finally:m.ACTIVE_DB.reset(token)
    token=m.ACTIVE_DB.set(tmp_path/'third.sqlite3')
    try:
        with pytest.raises(m.HTTPException) as err:m.reserve_cloud_review()
        assert err.value.status_code==429
    finally:m.ACTIVE_DB.reset(token)

def test_cloud_request_keeps_credentials_server_side(ctx,monkeypatch):
    m,c=ctx
    monkeypatch.setenv('AI_PROVIDER','ollama-cloud')
    monkeypatch.setenv('OLLAMA_MODEL','test-cloud')
    monkeypatch.setenv('OLLAMA_API_KEY','test-secret')
    class Response:
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def read(self,n):return json.dumps({'message':{'content':json.dumps({'action':'read','area':'invoices'})}}).encode()
    def request(req,timeout):
        assert req.full_url=='https://ollama.com/api/chat'
        assert req.get_header('Authorization')=='Bearer test-secret'
        payload=json.loads(req.data)
        assert 'format' not in payload
        assert 'test-secret' not in req.data.decode()
        return Response()
    monkeypatch.setattr(m.urllib.request,'urlopen',request)
    assert m.agent_model([{'role':'system','content':'Investigate.'}]).area=='invoices'
    assert 'test-secret' not in c.get('/api/state').text

def semantic(c,question='What paperwork should a new customer supply?',**extra):
    return c.post('/api/knowledge/ask',json={'question':question,'jurisdiction':'CA','tax_year':2026,'retrieval':'semantic',**extra})

def test_real_semantic_search_and_persistent_index(ctx,monkeypatch,tmp_path):
    m,c=ctx;monkeypatch.setenv('FASTEMBED_CACHE_PATH',str(Path(__file__).parents[3]/'work'/'embedding-cache'))
    result=semantic(c).json()
    assert result['mode'].startswith('Semantic search')
    assert result['citations'][0]['id']=='s1'
    assert result['citations'][0]['chunk_id']=='s1_0'
    assert result['retrieval']['database']=='Qdrant embedded'
    path=m.rag.vector_path(m.DB)
    assert (path/'manifest.json').exists()
    assert post(c,'knowledge/index').json()['chunks']==1
    assert semantic(c,'How do I assemble plutonium in a nuclear reactor?').json()['citations']==[]
    assert semantic(c,jurisdiction='US').json()['citations']==[]
    assert semantic(c,tax_year=2025).json()['citations']==[]

def test_vector_index_replaces_changed_and_revoked_sources(ctx):
    m,c=ctx
    assert semantic(c).json()['citations']
    with m.database(True) as db:db.execute("UPDATE sources SET body=? WHERE id='s1'",('The synthetic procedure covers only receivables aging and overdue invoice collection.',))
    updated=semantic(c,'How should overdue customer invoices be handled?').json()
    assert updated['citations']
    assert 'receivables aging' in updated['citations'][0]['excerpt']
    with m.database(True) as db:db.execute("UPDATE sources SET approved=0 WHERE id='s1'")
    assert post(c,'knowledge/index').json()['chunks']==0
    assert semantic(c).json()['citations']==[]

def test_vector_search_scope_and_unapproved_sources(ctx):
    m,c=ctx
    for country,year,approved in [('CA',2026,False),('US',2026,True),('CA',2025,True)]:
        post(c,'sources',{'title':'Interstellar cucumber policy','body':'Interstellar cucumber policy requires space cucumber receipts and galactic transport statements.','jurisdiction':country,'tax_year':year,'approved':approved})
    result=semantic(c,'What is the interstellar cucumber policy?').json()
    assert all(x['id']=='s1' for x in result['citations'])
    us=semantic(c,'What is the interstellar cucumber policy?',jurisdiction='US').json()
    assert us['citations'] and all(x['jurisdiction']=='US' for x in us['citations'])
    assert us['retrieval']['sources']==3

def test_public_rag_keeps_workspace_vectors_separate(ctx,monkeypatch):
    m,c=ctx;monkeypatch.setattr(m,'PUBLIC_DEMO',True);monkeypatch.setattr(m,'SESSION_SECRET','x'*40)
    first=TestClient(m.app,base_url='https://testserver');second=TestClient(m.app,base_url='https://testserver')
    first.get('/api/state');second.get('/api/state')
    post(first,'sources',{'title':'Private workspace penguin policy','body':'Penguin invoices must be checked by the penguin finance lead before payment.','jurisdiction':'US','tax_year':2026,'approved':True})
    assert semantic(first,'How are penguin invoices checked?',jurisdiction='US').json()['citations']
    assert semantic(second,'How are penguin invoices checked?',jurisdiction='US').json()['citations']==[]
    assert m.rag.vector_path(m.DB).exists() is False
    assert len(list(m.SESSION_ROOT.glob('*.vectors')))==1

def test_cloud_rag_uses_filtered_context_and_rejects_false_citation(ctx,monkeypatch):
    m,c=ctx
    for key,value in {'AI_PROVIDER':'ollama-cloud','OLLAMA_MODEL':'test-cloud','OLLAMA_API_KEY':'test-secret'}.items():monkeypatch.setenv(key,value)
    class Reply:
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def read(self,*args):return json.dumps({'message':{'content':'Collect bank statements and prior year records. [s1_0]'}}).encode()
    def provider(req,timeout):
        assert req.full_url=='https://ollama.com/api/chat'
        payload=json.loads(req.data)
        assert '[s1_0]' in payload['messages'][1]['content']
        assert 'test-secret' not in req.data.decode()
        return Reply()
    monkeypatch.setattr(m.urllib.request,'urlopen',provider)
    result=semantic(c,use_model=True).json()
    assert result['mode'].startswith('Cloud RAG draft')
    Reply.read=lambda *args:json.dumps({'message':{'content':'Unsupported tax advice [not_retrieved]'}}).encode()
    assert 'withheld' in semantic(c,use_model=True).json()['mode']

def test_semantic_failure_does_not_silently_fake_search(ctx,monkeypatch):
    m,c=ctx
    def fail(*args,**kwargs):raise m.rag.RetrievalUnavailable('Test outage')
    monkeypatch.setattr(m.rag,'retrieve',fail)
    assert semantic(c).status_code==503
    assert post(c,'knowledge/ask',{'question':'onboarding','jurisdiction':'CA','tax_year':2026,'retrieval':'keyword'}).json()['citations']

def test_official_reference_import_is_idempotent_and_scoped(ctx):
    _,c=ctx
    assert post(c,'knowledge/official-sources').json()['added']==2
    assert post(c,'knowledge/official-sources').json()['added']==0
    sources=[x for x in state(c)['sources'] if x['id'].startswith('official-')]
    assert {x['jurisdiction'] for x in sources}=={'CA','US'}
    assert all('2026-10-05' in x['body'] and x['source_url'].startswith('https://') for x in sources)
    answer=post(c,'knowledge/ask',{'question':'employment tax records four years','jurisdiction':'US','tax_year':2026}).json()
    assert any(x['id']=='official-irs-records-v1' for x in answer['citations'])


def test_schedule_due_atomic_repeat_and_disable(ctx):
    m,c=ctx
    assert not state(c)['schedule']['enabled']
    assert post(c,'workflows/schedule',{'enabled':True,'interval_minutes':14}).status_code==422
    schedule=post(c,'workflows/schedule',{'enabled':True,'interval_minutes':15}).json()
    due=schedule['next_run_at']
    assert not m.run_scheduled_workspace(m.DB,due-1)
    assert m.run_scheduled_workspace(m.DB,due)
    assert not m.run_scheduled_workspace(m.DB,due)
    result=state(c)
    assert len(result['workflow_runs'])==1
    assert result['workflow_runs'][0]['run_key']=='scheduled:'+str(due)
    assert result['workflow_runs'][0]['result']['sent']==0
    assert result['schedule']['next_run_at']==due+900
    post(c,'workflows/schedule',{'enabled':False,'interval_minutes':15})
    assert not m.run_scheduled_workspace(m.DB,due+900)


def test_schedule_missed_intervals_consolidate_and_concurrent_runs(ctx):
    from concurrent.futures import ThreadPoolExecutor
    m,c=ctx
    due=post(c,'workflows/schedule',{'enabled':True,'interval_minutes':15}).json()['next_run_at']
    at=due+3600
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda _:m.run_scheduled_workspace(m.DB,at),range(2)))
    assert sum(results)==1
    assert len(state(c)['workflow_runs'])==1
    assert state(c)['schedule']['next_run_at']==due+4500


def test_schedule_failure_rolls_back_and_retries_same_due(ctx,monkeypatch):
    m,c=ctx
    due=post(c,'workflows/schedule',{'enabled':True,'interval_minutes':15}).json()['next_run_at']
    original=m.execute_operations
    def fail(c,key):
        original(c,key)
        raise RuntimeError('test failure after workflow writes')
    monkeypatch.setattr(m,'execute_operations',fail)
    assert not m.run_scheduled_workspace(m.DB,due)
    snapshot=state(c)
    assert not snapshot['workflow_runs'] and not snapshot['drafts']
    assert snapshot['schedule']['failures']==1 and snapshot['schedule']['retry_at']==due+60
    monkeypatch.setattr(m,'execute_operations',original)
    assert not m.run_scheduled_workspace(m.DB,due+59)
    assert m.run_scheduled_workspace(m.DB,due+60)
    assert state(c)['schedule']['failures']==0
    assert state(c)['workflow_runs'][0]['run_key']=='scheduled:'+str(due)


def test_public_schedule_uses_only_own_workspace_and_expires(ctx,monkeypatch):
    m,c=ctx
    monkeypatch.setattr(m,'PUBLIC_DEMO',True)
    token=m.ACTIVE_DB.set(m.SESSION_ROOT/'scheduler-test.sqlite3')
    try:
        m.seed()
        schedule=m.set_schedule(m.ScheduleIn(enabled=True,interval_minutes=15))
        due=schedule['next_run_at']
        assert m.run_scheduled_workspace(m.ACTIVE_DB.get(),due)
        assert not m.run_scheduled_workspace(m.ACTIVE_DB.get(),schedule['expires_at'])
        with m.database() as db:
            assert not m.schedule_record(db)['enabled']
    finally:m.ACTIVE_DB.reset(token)
    assert not state(c)['workflow_runs'] and not state(c)['schedule']['enabled']
