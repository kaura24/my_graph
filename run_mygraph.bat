@echo off
setlocal

cd /d "%~dp0"

if not exist "python\.venv\Scripts\python.exe" (
  echo [ERROR] python\.venv\Scripts\python.exe not found.
  echo Please create venv and install requirements first:
  echo   cd python
  echo   python -m venv .venv
  echo   .venv\Scripts\python.exe -m pip install -r requirements.txt
  pause
  exit /b 1
)

echo Starting My Graph desktop app...
"python\.venv\Scripts\python.exe" "python\desktop.py"

endlocal
