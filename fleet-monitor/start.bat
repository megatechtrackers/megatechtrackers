@echo off
title Fleet Monitor

echo ========================================
echo        Fleet Monitor - Starting
echo ========================================
echo.

cd /d "%~dp0"

:: Check if dependencies are installed
pip show flask >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing dependencies...
    pip install -r requirements.txt --retries 5 --timeout 300
    echo.
)

echo Starting server on http://localhost:5002
echo Press Ctrl+C to stop
echo.

cd server
python app.py

pause
