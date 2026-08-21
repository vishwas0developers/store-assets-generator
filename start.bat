@echo off
cd /d "%~dp0"
setlocal enabledelayedexpansion
echo Starting Store Assets Generator...
echo.

:: 1. Check Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not on PATH.
    echo         Install Node.js 20+ from https://nodejs.org and try again.
    pause
    exit /b 1
)

:: 2. Build if needed
if not exist "dist\cli\index.js" (
    echo Build output not found - compiling...
    call npm run build
    if !errorlevel! neq 0 (
        echo.
        echo [ERROR] Build failed - see the TypeScript/npm output above for the exact error.
        echo         Common causes: missing dependencies ^(run setup.bat^), a syntax error
        echo         in recently edited source, or a missing package ^(run "npm install"^).
        pause
        exit /b 1
    )
)
if not exist "dist\web\index.html" (
    echo Web UI asset missing - re-running build to copy it...
    call npm run build
    if !errorlevel! neq 0 (
        echo.
        echo [ERROR] Build failed while copying the web interface asset. See output above.
        pause
        exit /b 1
    )
)

:: 2b. Clean up a stale instance holding the port from a previous run.
if "%SAG_UI_PORT%"=="" (set "SAG_PORT=8787") else (set "SAG_PORT=%SAG_UI_PORT%")

for /f "tokens=5" %%P in ('netstat -ano -p TCP ^| findstr /r /c:"[:.]%SAG_PORT% .*LISTENING"') do (
    set "STALE_PID=%%P"
)
if defined STALE_PID (
    echo Port %SAG_PORT% is in use by a previous instance ^(PID !STALE_PID!^) - stopping it...
    taskkill /pid !STALE_PID! /f >nul 2>nul
    set "STALE_PID="
)

:: Also stop any other lingering "node dist\cli\index.js" processes from this app.
for /f "skip=1 tokens=1,2 delims=," %%A in ('wmic process where "name='node.exe'" get CommandLine^,ProcessId /format:csv 2^>nul') do (
    echo %%A | findstr /c:"dist\cli\index.js" >nul 2>nul && if not "%%B"=="" taskkill /pid %%B /f >nul 2>nul
)

:: Wait for the port to actually be released (up to ~5s).
for /l %%I in (1,1,5) do (
    netstat -ano -p TCP | findstr /r /c:"[:.]%SAG_PORT% .*LISTENING" >nul 2>nul
    if !errorlevel! neq 0 goto :port_free
    timeout /t 1 /nobreak >nul
)
:port_free

:: 3. Start the web interface - this is the default startup behavior.
::    The CLI and MCP server remain available via:
::      node dist\cli\index.js generate --url ^<url^>
::      node dist\cli\index.js mcp
echo Starting web interface...
echo.
call node dist\cli\index.js ui
set UI_EXIT=%errorlevel%

if %UI_EXIT% neq 0 (
    echo.
    echo [ERROR] The web interface failed to start ^(exit code %UI_EXIT%^).
    echo         The specific reason is printed above ^(e.g. port already in use,
    echo         missing web asset, or a startup exception^). Common fixes:
    echo           - Port in use: set SAG_UI_PORT to a free port and retry.
    echo           - Missing asset: run "npm run build" and retry.
    echo           - Missing dependency: run setup.bat.
    pause
    exit /b %UI_EXIT%
)

pause
