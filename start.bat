@echo off
setlocal
cd /d "%~dp0"
title Local AI - Final Submission 1.0

echo ==========================================
echo   Local AI - Final Submission 1.0
echo ==========================================
echo.
echo Opening http://127.0.0.1:8501
echo Core inference and RAG run locally after one-time model setup.
echo.
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:8501"

where python >nul 2>nul
if not errorlevel 1 (
  python app.py
) else (
  py app.py
)
pause
