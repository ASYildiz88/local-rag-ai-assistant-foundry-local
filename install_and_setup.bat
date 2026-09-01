@echo off
setlocal
cd /d "%~dp0"
title Local AI - Final Submission 1.0 Setup

echo ==========================================
echo   Local AI - One-time Setup
echo ==========================================
echo.
echo This step installs Python packages and downloads/caches local AI models.
echo Internet access may be required during this one-time setup.
echo After setup, the core assistant is designed to run offline.
echo.

where python >nul 2>nul
if errorlevel 1 (
  where py >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] Python 3.11+ was not found.
    pause
    exit /b 1
  )
  set PY=py
) else (
  set PY=python
)

%PY% -m pip install --upgrade pip
if errorlevel 1 goto :fail
%PY% -m pip install -r requirements.txt
if errorlevel 1 goto :fail
%PY% setup_models.py
if errorlevel 1 goto :fail

echo.
echo Setup complete. Starting Local AI...
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:8501"
%PY% app.py
goto :eof

:fail
echo.
echo Setup failed. Read the error above.
pause
exit /b 1
