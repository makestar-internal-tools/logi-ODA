@echo off
echo 앱 업데이트 중...
cd /d "%~dp0"
npx @electron/asar extract dist\win-unpacked\resources\app.asar dist\app-extracted
copy /y index.html dist\app-extracted\index.html
npx @electron/asar pack dist\app-extracted dist\win-unpacked\resources\app.asar
echo 완료! 앱을 다시 실행하세요.
start "" "dist\win-unpacked\출고소요일분석.exe"
