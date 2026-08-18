# AMP-2000 Retro Music Player PowerShell Launcher
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  AMP-2000 RETRO MEDIA PLAYER (WMP/WINAMP 2000s) " -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Cyan

$path = Join-Path $PSScriptRoot "index.html"
Write-Host "Abriendo reproductor en el navegador predeterminado..." -ForegroundColor Green
Start-Process $path
