@echo off
setlocal
chcp 65001 >nul 2>&1
title EN_video - YouTube to Excel
cd /d "%~dp0"

echo ============================================================
echo   EN_video : YouTube  --^>  Tu vung tieng Anh  --^>  Excel
echo ============================================================
echo.
echo   Nho: dan link vao o B2 sheet "NHAP VIDEO" va DONG Excel truoc.
echo.

set PY=
python --version >nul 2>&1 && set PY=python
if not defined PY py -3 --version >nul 2>&1 && set PY=py -3
if not defined PY (
  echo [X] Chua cai Python. Chay EN_setup.bat truoc.
  pause
  exit /b 1
)

%PY% -c "import openpyxl, cmudict, youtube_transcript_api, yt_dlp" >nul 2>&1
if errorlevel 1 (
  echo [!] Dang cai thu vien lan dau, cho 1-2 phut...
  %PY% -m pip install --upgrade pip
  %PY% -m pip install -U openpyxl cmudict youtube-transcript-api yt-dlp
  echo.
)

%PY% "%~dp0EN_video.py" %*

echo.
echo ============================================================
pause
endlocal
