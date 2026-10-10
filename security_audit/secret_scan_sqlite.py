"""Fail-closed scan of Git index blobs, SQLite credential columns, and key files.

No arguments scans all indexed database/key files. --staged scans changed paths.
Filename arguments also use index blobs, never a possibly different working copy.
Reports contain filenames, detector names and counts; no credential values.
"""
import pathlib,re,sqlite3,subprocess,sys
PATTERNS={
 'google_api_key':rb'AIza[0-9A-Za-z_-]{35}',
 'openai_key':rb'sk-(?:proj-[A-Za-z0-9_-]{40,}|[A-Za-z0-9]{32,})(?![A-Za-z0-9_-])',
 'github_token':rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})',
 'stripe_secret':rb'[sr]k_(?:live|test)_[A-Za-z0-9]{16,}',
 'private_key':rb'-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----',
 'jwt':rb'eyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]{8,}',
 'oauth_secret':rb'GOCSPX-[A-Za-z0-9_-]{20,}',
}
EXT=('.sqlite','.sqlite3','.db','.db3')
KEY=re.compile(r'(?i)(^|/)\.[a-z0-9_]*(key|secret|token)$')
LIMIT=64*1024*1024
def git(*args):
 try:r=subprocess.run(['git',*args],capture_output=True,timeout=60)
 except (OSError,subprocess.TimeoutExpired):raise RuntimeError('Git unavailable or timed out')
 if r.returncode:raise RuntimeError('Git command failed')
 return r.stdout
def quote(name):return '"'+name.replace('"','""')+'"'
def database(data):
 c=sqlite3.connect(':memory:');count=0
 try:
  c.deserialize(data)
  if c.execute('PRAGMA quick_check').fetchall()!=[('ok',)]:raise RuntimeError('SQLite integrity check failed')
  tables=[r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
  for table in tables:
   cols=[r[1] for r in c.execute('PRAGMA table_info('+quote(table)+')')]
   for col in cols:
    if not (re.search(r'(?i)(api.?key|private.?key|client.?secret|auth.?token|access.?token|refresh.?token|fernet.?key|encryption.?key)',col) or ('cookie' in table.lower() and col.lower()=='value')):continue
    for (value,) in c.execute('SELECT '+quote(col)+' FROM '+quote(table)+' WHERE typeof('+quote(col)+") IN ('text','blob')"):
     b=value.encode() if isinstance(value,str) else value
     if not b.strip():continue
     if re.fullmatch(rb'(?:env|vault|secret):[A-Za-z0-9_./-]+',b):continue
     if b.startswith(b'gAAAAA'):continue
     # A populated credential field needs explicit review even if no provider pattern matches.
     count+=1
 except sqlite3.Error:raise RuntimeError('SQLite could not be fully scanned')
 finally:c.close()
 return count
def inspect(data,name):
 findings=[]
 for rule,pat in PATTERNS.items():
  n=len(re.findall(pat,data))
  if n:findings.append((rule,n))
 if KEY.search(name) and re.fullmatch(rb'[A-Za-z0-9_-]{43}=',data.strip()):findings.append(('fernet_key',1))
 if data.startswith(b'SQLite format 3\x00'):
  n=database(data)
  if n:findings.append(('plaintext_credential_column',n))
 elif name.lower().endswith(EXT):raise RuntimeError('Database extension without readable SQLite header')
 return findings
def main(args):
 staged='--staged' in args;requested={p.replace('\\','/') for p in args if p!='--staged'}
 try:
  changed=set(git('diff','--cached','--name-only','--diff-filter=ACMR','-z').decode('utf-8',errors='surrogateescape').split('\x00')) if staged else None
  records=git('ls-files','--stage','-z').split(b'\x00');found=set();bad=0
  for record in records:
   if not record:continue
   meta,rawname=record.split(b'\t',1);mode,oid,stage=meta.split();name=rawname.decode('utf-8',errors='surrogateescape')
   if stage!=b'0':raise RuntimeError('Unresolved index conflict')
   if requested and name not in requested:continue
   if changed is not None and name not in changed:continue
   found.add(name)
   if not (name.lower().endswith(EXT) or KEY.search(name)):continue
   if mode not in (b'100644',b'100755'):raise RuntimeError('Database or key is not a regular indexed file')
   size=int(git('cat-file','-s',oid.decode()).strip())
   if size>LIMIT:raise RuntimeError('Database/key exceeds scanner memory limit')
   try:items=inspect(git('cat-file','blob',oid.decode()),name)
   except RuntimeError as e:print('SCAN-ERROR',name,str(e));bad=2;continue
   for rule,n in items:print('SECRET-CANDIDATE',name,rule,'count='+str(n));bad=max(bad,1)
  if requested-found:raise RuntimeError('Requested file is not present in the scanned index')
  return bad
 except (RuntimeError,ValueError) as e:print('SCAN-ERROR',str(e));return 2
if __name__=='__main__':sys.exit(main(sys.argv[1:]))
