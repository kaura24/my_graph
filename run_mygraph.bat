@echo off
setlocal

cd /d "%~dp0"

REM === 사전 검증 ===
if not exist "python\.venv\Scripts\python.exe" (
  echo [ERROR] python\.venv\Scripts\python.exe not found.
  echo   cd python
  echo   python -m venv .venv
  echo   .venv\Scripts\python.exe -m pip install -r requirements.txt
  pause
  exit /b 1
)

REM === 기존 프로세스 정리 (포트 8000) ===
echo [1/4] Cleaning port 8000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr LISTENING 2^>nul') do (
  taskkill /PID %%a /F /T >nul 2>&1
)
timeout /t 1 /nobreak >nul

REM === 백엔드 시작 ===
echo [2/4] Starting backend (port 8000)...
start /b "" "python\.venv\Scripts\python.exe" -m uvicorn app.app:app --host 127.0.0.1 --port 8000 --app-dir python

REM === 헬스체크 대기 (최대 120초) ===
echo [3/4] Waiting for backend (model loading ~60s)...
set /a tries=0
:healthloop
set /a tries+=1
if %tries% gtr 60 (
  echo [ERROR] Backend did not respond within 120 seconds.
  pause
  exit /b 1
)
timeout /t 2 /nobreak >nul
curl -s -m 3 -o nul -w "%%{http_code}" http://127.0.0.1:8000/api/docs | findstr "200" >nul 2>&1
if errorlevel 1 goto healthloop

echo [4/4] Backend ready! Starting desktop app...
"python\.venv\Scripts\python.exe" "python\desktop.py"

endlocal
