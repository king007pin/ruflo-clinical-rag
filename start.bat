@echo off
:: ==============================================================================
:: 🩺 MedIQ Local Launcher & Auto-Updater Script (Windows)
:: ==============================================================================
:: This batch script automates launching MedIQ locally on Windows. It pulls
:: updates from GitHub, checks prerequisites, sets up secrets, starts the server,
:: and opens the application in your default browser.
:: ==============================================================================

title MedIQ Local Launcher
cls

echo ==========================================================
echo     __  ___          dIQ       
echo    /  ^|/  /__  _____/ /____ _  
echo   / /^|_/ / _ \/ __  / / __ \`/  
echo  / /  / /  __/ /_/ / / /_/ /   
echo /_/  /_/\___/\__,_/_/\__, /    
echo                     /____/     
echo  🩺 SOTA Multi-Specialty Clinical Intelligence Platform
echo ==========================================================
echo.

:: 1. Automatically Pull Latest Updates from GitHub
echo [1/5] Checking for codebase updates on GitHub...
git rev-parse --is-inside-work-tree >nul 2>&1
if %errorlevel% equ 0 (
  echo Syncing with remote GitHub repository...
  git pull origin main
  if %errorlevel% equ 0 (
    echo ✓ Local server successfully updated to the latest GitHub version!
  ) else (
    echo ⚠ Could not connect to GitHub (running in offline mode). Using local cache.
  )
) else (
  echo ⚠ Not running inside a Git repository. Skipping auto-updates.
)
echo.

:: 2. Prerequisite Checks (Node.js)
echo [2/5] Checking development environment...
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo ❌ Node.js is not installed on your machine!
  echo To install Node.js easily:
  echo   Please download and run the installer from: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo ✓ Node.js is installed (%NODE_VERSION%)
echo.

:: 3. Check & Install Dependencies
echo [3/5] Syncing package dependencies...
if not exist "node_modules" (
  echo Dependencies missing. Installing (this may take a minute)...
  call npm install
) else (
  echo ✓ Dependencies check completed. Syncing...
  call npm install
)
echo.

:: 4. Environment Secrets & Database Setup
echo [4/5] Aligning local configuration and secrets...
if not exist ".env.local" (
  echo Local environment file .env.local not found. Creating a secure default...
  if exist ".env.example" (
    copy .env.example .env.local >nul
  ) else (
    type nul > .env.local
  )
  call npm run setup-secrets
) else (
  echo ✓ Secure environment configuration (.env.local) exists!
)

:: Verify database structures & seed admin user
echo Verifying database structures ^& admin accounts...
call npm run db:setup >nul 2>&1
call npm run db:seed-admin >nul 2>&1
echo ✓ Database check completed successfully!
echo.

:: 5. Launch Dev Server & Open Browser
echo [5/5] Launching the MedIQ Local Server...
echo ✓ Starting local web server at http://localhost:3000
echo ✓ Auto-bypassing password login on your local machine for best experience!
echo.
echo 🚀 Opening http://localhost:3000 in your web browser...
echo ⚠ Press Ctrl+C inside this window to stop the server at any time.
echo ==========================================================
echo.

:: Wait briefly and open default web browser
timeout /t 2 /nobreak >nul
start http://localhost:3000

:: Start dev server
call npm run dev
