@echo off
setlocal
chcp 65001 >nul 2>&1
title EN_add - Them tu moi
cd /d "%~dp0"

echo ============================================================
echo   EN_add : Them tu moi vao file tu vung
echo ============================================================
echo.
echo   Nho: go tu vao cot A sheet "THEM TU MOI" va DONG Excel truoc.
echo.

set PY=
python --version >nul 2>&1 && set PY=python
if not defined PY py -3 --version >nul 2>&1 && set PY=py -3
if not defined PY (
  echo [X] Chua cai Python. Chay EN_setup.bat truoc.
  pause
  exit /b 1
)

%PY% -c "import openpyxl, cmudict" >nul 2>&1
if errorlevel 1 (
  echo [!] Dang cai thu vien lan dau, cho 1-2 phut...
  %PY% -m pip install -U openpyxl cmudict
  echo.
)

%PY% "%~dp0EN_add.py" %*

echo.
echo ============================================================
pause
endlocal
