import os
import sys,json,re
sys.path.insert(0,'/tmp/claude-0/-home-claude/f8d119db-dda4-5475-adef-951176d83160/scratchpad')
from hira import *
from concurrent.futures import ThreadPoolExecutor
B='/tmp/claude-0/-home-claude/f8d119db-dda4-5475-adef-951176d83160/scratchpad/'
data=json.load(open(B+'nps/seoul.json'))
rows=[]
for t in ['eye','dental']:
    for i,r in enumerate(data[t]): rows.append(dict(r,id=f"s-{t}-{i+1}",type=t))
def clean(n):
    n=re.sub(r'^(의료법인|재단법인|사단법인)[:：]?\s*','',n); n=re.sub(r'\(.*?\)','',n); return n.strip()
def basis(r):
    nm=clean(r['n'])
    j=call('hospInfoServicev2/getHospBasisList',sidoCd=110000,yadmNm=nm,numOfRows=20)
    its=items(j) if isinstance(j,dict) else None
    if its is None: return r['id'],{'err':str(j)[:200]}
    cand=[x for x in its if x.get('sgguCdNm')==r['gu']] or its
    exact=[x for x in cand if x['yadmNm'].replace(' ','')==nm.replace(' ','')]
    pick=(exact or cand)[0] if cand else None
    if not pick: return r['id'],{'nomatch':True,'q':nm}
    keep={k:pick.get(k) for k in ['ykiho','yadmNm','clCd','clCdNm','drTotCnt','mdeptSdrCnt','mdeptGdrCnt','estbDd','addr','sgguCdNm','hospUrl']}
    keep['exact']=bool(exact); keep['ncand']=len(its)
    return r['id'],keep
out={}
with ThreadPoolExecutor(10) as ex:
    for k,(i,v) in enumerate(ex.map(basis,rows)):
        out[i]=v
        if k%20==0: print('basis',k,flush=True)
json.dump(out,open(B+'basis.json','w'),ensure_ascii=False)
def npay(i):
    v=out[i]
    j=call('nonPaymentDamtInfoService/getNonPaymentItemHospDtlList',ykiho=v['ykiho'],numOfRows=500)
    its=items(j) if isinstance(j,dict) else None
    return i,its
targets=[i for i,v in out.items() if v.get('ykiho') and str(v.get('clCdNm')) not in ('의원','치과의원')]
print('npay targets',len(targets),flush=True)
np={}
with ThreadPoolExecutor(10) as ex:
    for i,its in ex.map(npay,targets): np[i]=its
json.dump(np,open(B+'npay.json','w'),ensure_ascii=False)
print('done',flush=True)
