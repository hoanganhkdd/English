@echo off
setlocal
chcp 65001 >nul 2>&1
title EN_video - Chan doan video
cd /d "%~dp0"

echo ============================================================
echo   CHAN DOAN VIDEO : xem video co phu de tieng Anh khong
echo ============================================================
echo.

set /p LINK=Dan link YouTube roi bam Enter: 

set PY=
python --version >nul 2>&1 && set PY=python
if not defined PY py -3 --version >nul 2>&1 && set PY=py -3
if not defined PY (
  echo [X] Chua cai Python. Chay EN_setup.bat truoc.
  pause
  exit /b 1
)

%PY% "%~dp0EN_video.py" --check "%LINK%"

echo.
echo ============================================================
pause
endlocal
