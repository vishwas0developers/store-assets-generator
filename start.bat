@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

REM ─────────────────────────────────────────────────────────────────────────────
REM  Store Assets Generator — Desktop Application Launcher
REM  Requires: Node.js, npm
REM ─────────────────────────────────────────────────────────────────────────────

echo Starting Store Assets Generator Desktop Application...

call npx electron .
if !ERRORLEVEL! neq 0 (
    echo.
    echo ERROR: Desktop application exited with code !ERRORLEVEL!.
    pause
    exit /b !ERRORLEVEL!
)
