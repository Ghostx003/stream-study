@echo off
setlocal EnableDelayedExpansion
title Courseflix - LAN and Tailscale Remote Streaming Server
color 0A

cd /d "%~dp0"

echo ===============================================================================
echo        Courseflix -- LAN and Tailscale Remote Streaming Server
echo ===============================================================================
echo.

REM 1. Verify Node.js availability
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js is not installed or not found in your system PATH!
    echo Please install Node.js v18 or newer from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM 2. Verify Server Dependencies
if not exist "server\node_modules\" (
    echo [SETUP] Installing backend server dependencies...
    pushd server
    call npm install
    if !errorlevel! neq 0 (
        color 0C
        echo [ERROR] Failed to install server dependencies.
        popd
        pause
        exit /b 1
    )
    popd
    echo [SETUP] Server dependencies installed successfully.
    echo.
)

REM 3. Verify Client Build
if not exist "client\dist\" (
    echo [SETUP] Building frontend client application...
    if not exist "client\node_modules\" (
        echo [SETUP] Installing client dependencies...
        pushd client
        call npm install
        popd
    )
    pushd client
    call npm run build
    if !errorlevel! neq 0 (
        color 0C
        echo [ERROR] Failed to build client application.
        popd
        pause
        exit /b 1
    )
    popd
    echo [SETUP] Client built successfully.
    echo.
)

REM 4. Launch Server
echo [INFO] Launching Courseflix Streaming Server...
echo [INFO] Press Ctrl+C in this window at any time to stop the server.
echo.
node scripts\start-interactive.js

echo.
echo ===============================================================================
echo   Courseflix Server process stopped.
echo ===============================================================================
pause
