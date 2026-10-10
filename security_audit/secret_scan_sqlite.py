"""Fail-closed scan of Git index blobs, SQLite credential columns, and key files.

No arguments scans all indexed files. All SQLite databases are forbidden, including archive members. --staged scans changed paths.
Filename arguments also use index blobs, never a possibly different working copy.
Reports contain filenames, detector names and counts; no credential values.
"""
import pathlib,re,sqlite3,subprocess,sys,io,zipfile,tarfile,gzip,bz2,lzma
PATTERNS={
 'google_api_key':rb'AIza[0-9A-Za-z_-]{35}',
 'openai_key':rb'sk-(?:proj-[A-Za-z0-9_-]{40,}|[A-Za-z0-9]{32,})(?![A-Za-z0-9_-])',
 'github_token':rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})',
 'stripe_secret':rb'[sr]k_(?:live|test)_[A-Za-z0-9]{16,}',
 'private_key':rb'-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----',
 'jwt':rb'eyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]{8,}',
 'oauth_secret':rb'GOCSPX-[A-Za-z0-9_-]{20,}',
}
EXT=('.sqlite','.sqlite3','.db','.db3','.sqlite-wal','.sqlite-shm','.sqlite-journal','.sqlite3-wal','.sqlite3-shm','.sqlite3-journal','.db-wal','.db-shm','.db-journal','.db3-wal','.db3-shm','.db3-journal')
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
 # Gitleaks checks source credentials with its contextual allowlist.
 # Preserve this helper's original key-file scope while checking EVERY blob for SQLite.
 for rule,pat in (PATTERNS.items() if KEY.search(name) or name.lower().endswith(EXT) else []):
  n=len(re.findall(pat,data))
  if n:findings.append((rule,n))
 if KEY.search(name) and re.fullmatch(rb'[A-Za-z0-9_-]{43}=',data.strip()):findings.append(('fernet_key',1))
 if data.startswith(b'SQLite format 3\x00') or name.lower().endswith(EXT):
  findings.append(('sqlite_database_forbidden',1))
 if data.startswith(b'PK') or name.lower().endswith(('.7z','.rar','.tar','.tar.gz','.tgz','.gz','.bz2','.xz')):
  findings.extend(archive_databases(data,name))
 return findings
def archive_databases(data,name,depth=0):
 if depth>=3:raise RuntimeError('Archive nesting requires review')
 findings=[];members=[]
 try:
  if data.startswith(b'PK'):
   with zipfile.ZipFile(io.BytesIO(data)) as z:
    entries=z.infolist()
    if len(entries)>20000 or sum(x.file_size for x in entries)>200*1024*1024:raise RuntimeError('Archive inspection limit exceeded')
    for x in entries:
     if x.is_dir():continue
     if x.file_size>LIMIT:raise RuntimeError('Archive member exceeds limit')
     members.append((x.filename,z.read(x)))
  elif name.lower().endswith(('.7z','.rar')):raise RuntimeError('Archive format requires verified review')
  else:
   payload=data
   if data.startswith(b'\x1f\x8b'):
    with gzip.GzipFile(fileobj=io.BytesIO(data)) as f:payload=f.read(LIMIT+1)
   elif data.startswith(b'BZh'):
    with bz2.BZ2File(io.BytesIO(data)) as f:payload=f.read(LIMIT+1)
   elif data.startswith(b'\xfd7zXZ\x00'):
    with lzma.LZMAFile(io.BytesIO(data)) as f:payload=f.read(LIMIT+1)
   if len(payload)>LIMIT:raise RuntimeError('Compressed payload exceeds limit')
   try:
    with tarfile.open(fileobj=io.BytesIO(payload),mode='r:') as t:
     entries=t.getmembers()
     if len(entries)>20000 or sum(x.size for x in entries)>200*1024*1024:raise RuntimeError('Archive inspection limit exceeded')
     for x in entries:
      if not x.isfile():continue
      if x.size>LIMIT:raise RuntimeError('Archive member exceeds limit')
      with t.extractfile(x) as f:members.append((x.name,f.read()))
   except tarfile.ReadError:
    if payload==data:raise RuntimeError('Archive could not be fully checked')
    members.append((name.rsplit('.',1)[0],payload))
  for member,content in members:
   if content.startswith(b'SQLite format 3\x00') or member.lower().endswith(EXT):findings.append(('archive_contains_sqlite_forbidden',1))
   if content.startswith(b'PK') or member.lower().endswith(('.7z','.rar','.tar','.tar.gz','.tgz','.gz','.bz2','.xz')):findings.extend(archive_databases(content,member,depth+1))
 except (zipfile.BadZipFile,tarfile.TarError,ValueError,NotImplementedError,OSError) as e:raise RuntimeError('Archive could not be fully checked') from e
 return findings

class IndexBlobs:
 def __enter__(self):
  self.proc=subprocess.Popen(['git','cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE);return self
 def read(self,oid):
  self.proc.stdin.write(oid+b'\n');self.proc.stdin.flush();header=self.proc.stdout.readline().split()
  if len(header)!=3 or header[1]!=b'blob':raise RuntimeError('Indexed object unavailable')
  size=int(header[2])
  if size>LIMIT:raise RuntimeError('Indexed file exceeds scanner limit; review required')
  data=self.proc.stdout.read(size)
  if len(data)!=size or self.proc.stdout.read(1)!=b'\n':raise RuntimeError('Indexed blob was truncated')
  return data
 def __exit__(self,kind,value,traceback):
  if kind:
   self.proc.kill();self.proc.wait();return False
  self.proc.stdin.close()
  try:self.proc.wait(timeout=10)
  except subprocess.TimeoutExpired:self.proc.kill();self.proc.wait();raise RuntimeError('Git index process timed out')
  if self.proc.returncode:raise RuntimeError('Git index process failed')

def main(args):
 staged='--staged' in args;requested={p.replace('\\','/') for p in args if p!='--staged'}
 try:
  changed=set(git('diff','--cached','--name-only','--diff-filter=ACMR','-z').decode('utf-8',errors='surrogateescape').split('\x00')) if staged else None
  records=git('ls-files','--stage','-z').split(b'\x00');found=set();bad=0
  with IndexBlobs() as blobs:
   for record in records:
    if not record:continue
    meta,rawname=record.split(b'\t',1);mode,oid,stage=meta.split();name=rawname.decode('utf-8',errors='surrogateescape')
    if stage!=b'0':raise RuntimeError('Unresolved index conflict')
    if requested and name not in requested:continue
    if changed is not None and name not in changed:continue
    found.add(name)
    if mode==b'160000':continue
    if mode not in (b'100644',b'100755',b'120000'):raise RuntimeError('Unsupported indexed file mode')
    # Read exact indexed bytes, including headers of files with misleading names.
    try:items=inspect(blobs.read(oid),name)
    except RuntimeError as e:print('SCAN-ERROR',name,str(e));bad=2;continue
    for rule,n in items:print('SECRET-CANDIDATE',name,rule,'count='+str(n));bad=max(bad,1)
  if requested-found:raise RuntimeError('Requested file is not present in the scanned index')
  return bad
 except (RuntimeError,ValueError) as e:print('SCAN-ERROR',str(e));return 2
if __name__=='__main__':sys.exit(main(sys.argv[1:]))
