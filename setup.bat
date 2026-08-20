@echo off
cd /d "%~dp0"
setlocal enabledelayedexpansion
echo Starting first-time setup for Store Assets Generator...
echo.

:: Check Node.js
where node >nul 2>nul
if !errorlevel! neq 0 (
    echo [ERROR] Node.js is not installed or not on PATH.
    echo         Install Node.js 20+ from https://nodejs.org and try again.
    pause
    exit /b 1
)

:: Install dependencies
echo Installing npm packages...
call npm install
if !errorlevel! neq 0 (
    echo.
    echo [ERROR] "npm install" failed ^(exit code !errorlevel!^) - see the npm output above.
    echo         Common causes: no internet connection, a registry/proxy issue, or a
    echo         corrupted node_modules ^(try deleting node_modules and retrying^).
    pause
    exit /b 1
)

:: Install Playwright Chromium browser
echo.
echo Installing Playwright Chromium browser...
call npx playwright install chromium
if !errorlevel! neq 0 (
    echo.
    echo [ERROR] Playwright browser install failed ^(exit code !errorlevel!^).
    echo         Try running "npx playwright install chromium" manually to see the
    echo         full error ^(often a network/proxy or disk space issue^).
    pause
    exit /b 1
)

:: Build project
echo.
echo Compiling TypeScript project...
call npm run build
if !errorlevel! neq 0 (
    echo.
    echo [ERROR] Build failed ^(exit code !errorlevel!^) - see the TypeScript output above
    echo         for the exact error and line number.
    pause
    exit /b 1
)

:: Install Agent Skills and configure MCP
echo.
echo Installing agent skills...
call node dist\cli\index.js install
if !errorlevel! neq 0 (
    echo.
    echo [WARNING] Agent skill installation reported an error ^(exit code !errorlevel!^).
    echo           Core setup ^(dependencies + build^) succeeded - you can retry skill
    echo           installation later with "node dist\cli\index.js install".
)

echo.
echo Setup complete. Start the project with start.bat.
pause
