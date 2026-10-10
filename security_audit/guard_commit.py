"""Native pre-commit launcher. No bypass flags; missing scanners fail closed."""
import pathlib,subprocess,sys
from secret_scan_sqlite import main as sqlite_guard
def main():
 try:
  result=subprocess.run(['gitleaks','git','.','--pre-commit','--staged','--redact=100','--no-banner','--config','.gitleaks.toml'],capture_output=True,timeout=120)
 except (OSError,subprocess.TimeoutExpired):
  print('SECURITY BLOCK: Gitleaks unavailable or timed out.');return 2
 if result.returncode:
  print('SECURITY BLOCK: Gitleaks detected a finding or scanner error. Review locally with --redact=100.');return result.returncode
 return sqlite_guard(['--staged'])
if __name__=='__main__':sys.exit(main())
