@echo off
setlocal
chcp 65001 >nul 2>&1
title EN Vocab - Cai dat lan dau
cd /d "%~dp0"

echo ============================================================
echo   CAI DAT THU VIEN CHO BO HOC TIENG ANH XUAT NHAP KHAU
echo ============================================================
echo.

set PY=
python --version >nul 2>&1 && set PY=python
if not defined PY py -3 --version >nul 2>&1 && set PY=py -3
if not defined PY (
  echo [X] Chua cai Python. Tai tai: https://www.python.org/downloads/
  echo     Nho tick "Add Python to PATH" khi cai.
  pause
  exit /b 1
)

%PY% -m pip install --upgrade pip
%PY% -m pip install -U openpyxl cmudict youtube-transcript-api yt-dlp

echo.
echo [OK] Cai dat xong. Bay gio chay EN_build.bat de tao file Excel.
echo ============================================================
pause
endlocal
