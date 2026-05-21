@echo off
REM Un double-clic : build + commit (si besoin) + push main → Vercel
cd /d "%~dp0"
call npm run deploy:prod
echo.
pause
