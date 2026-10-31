@echo off
chcp 65001 >nul
echo [bat] started > "%~dp0bat-ran.txt"
echo CalCheck APK build - 창을 닫지 마세요
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-apk.ps1"
echo.
echo [bat] powershell exit code %ERRORLEVEL% >> "%~dp0bat-ran.txt"
echo.
echo ===== 끝. 아무 키나 누르면 창이 닫힙니다 =====
pause >nul
