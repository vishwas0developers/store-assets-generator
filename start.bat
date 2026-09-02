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

call npx electron .
if !ERRORLEVEL! neq 0 (
    echo.
    echo ERROR: Desktop application exited with code !ERRORLEVEL!.
    pause
    exit /b !ERRORLEVEL!
)
