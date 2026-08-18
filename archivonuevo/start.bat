@echo off
title AMP-2000 Retro Media Player Launcher
echo Starting AMP-2000 Retro Media Player...
where electron >nul 2>&1
if %errorlevel% equ 0 (
    echo Launching Electron desktop window...
    electron .
) else (
    where python >nul 2>&1
    if %errorlevel% equ 0 (
        echo Launching Python web desktop launcher...
        python start_app.py
    ) else (
        echo Opening index.html in default browser...
        start index.html
    )
)
