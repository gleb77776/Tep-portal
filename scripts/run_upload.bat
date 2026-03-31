@echo off
cd /d "%~dp0"
cd ..

echo Запуск скрипта загрузки диаграмм...
REM На localhost / без доступа к SharePoint: python scripts\upload_diagrams.py --local
python scripts\upload_diagrams.py %*

if errorlevel 1 (
    echo Ошибка при выполнении скрипта.
    pause
    exit /b 1
)

echo Скрипт выполнен успешно.
pause
