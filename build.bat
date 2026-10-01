@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

REM ─────────────────────────────────────────────────────────────────────────────
REM  Store Assets Generator — Standalone Windows Desktop App (.exe) Build Script
REM  Requires: Node.js, npm
REM ─────────────────────────────────────────────────────────────────────────────

echo 1. Checking prerequisites...
for %%T in (node npm) do (
    where %%T >nul 2>&1
    if !ERRORLEVEL! neq 0 (
        echo   [FAIL] %%T not found in PATH.
        pause
        exit /b 1
    )
    echo   [OK]   %%T
)

echo.
echo 2. Incrementing build version ^(package.json is the single source of truth^)...
call npm version patch --no-git-tag-version >nul
if !ERRORLEVEL! neq 0 (
    echo   [FAIL] Version bump failed.
    pause
    exit /b 1
)
for /f %%V in ('node -p "require('./package.json').version"') do set "APP_VERSION=%%V"
echo   [OK]   Building version !APP_VERSION!

echo.
echo 3. Installing dependencies...
call npm install
if !ERRORLEVEL! neq 0 (
    echo.
    echo ERROR: npm install failed ^(exit code !ERRORLEVEL!^).
    pause
    exit /b !ERRORLEVEL!
)

echo.
echo 4. Compiling TypeScript and web assets...
call npm run build
if !ERRORLEVEL! neq 0 (
    echo.
    echo ERROR: Build failed ^(exit code !ERRORLEVEL!^).
    pause
    exit /b !ERRORLEVEL!
)

echo.
echo 5. Packaging Standalone Windows Desktop Executable (.exe)...
call npx electron-builder --win nsis --x64
if !ERRORLEVEL! neq 0 (
    echo.
    echo ERROR: Packaging failed ^(exit code !ERRORLEVEL!^).
    pause
    exit /b !ERRORLEVEL!
)

echo.
echo =========================================================================
echo  Build Succeeded Cleanly - version !APP_VERSION!.
echo  Standalone Windows installer generated in: dist/
echo =========================================================================
echo.
pause
