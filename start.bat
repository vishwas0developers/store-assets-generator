@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

REM ─────────────────────────────────────────────────────────────────────────────
REM  Store Assets Generator — Desktop Application Launcher
REM  Requires: Node.js, npm
REM ─────────────────────────────────────────────────────────────────────────────

echo Starting Store Assets Generator Desktop Application...

REM ─────────────────────────────────────────────────────────────────────────────
REM  Clean up any leftover instance still holding the web server port before
REM  launching -- otherwise Electron's main process throws EADDRINUSE and dies.
REM ─────────────────────────────────────────────────────────────────────────────
set "APP_PORT=8787"
echo Checking for existing processes on port %APP_PORT%...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:"[0-9]:%APP_PORT% .*LISTENING"') do (
    echo Terminating existing process ^(PID %%P^) on port %APP_PORT%...
    taskkill /PID %%P /F >nul 2>&1
)

REM Give Windows a moment to fully release the socket before rebinding.
timeout /t 1 /nobreak >nul

REM electron.exe is a GUI-subsystem binary: on Windows its stdout/stderr never reach
REM this console unless piped. Piping through `findstr "^"` (pass-through, no paging) forces live output; the logging
REM env var also forwards renderer console messages and Chromium errors.
set ELECTRON_ENABLE_LOGGING=1
call npx electron . 2>&1 | findstr "^"

echo.
echo Application closed. Press any key to close this window...
pause >nul
