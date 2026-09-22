# 真机一键验证（等 ADB 连上后运行）
#   pwsh -File scripts/verify-device.ps1
# 做四件事：安装最新 APK → 截图 → 点/拖底栏三格 → 查流体云实况通知状态
param(
    [string]$Adb = 'D:\Android\Sdk\platform-tools\adb.exe',
    [string]$Apk = 'app\build\outputs\apk\release\app-release.apk'
)

$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

Write-Host '=== 0) 设备 ===' -ForegroundColor Cyan
& $Adb devices -l
$devices = (& $Adb devices 2>&1) -join ' '
if ($devices -notmatch "`tdevice") {
    Write-Host '设备未就绪：请确认 USB 调试授权 + USB 用途为「传输文件」' -ForegroundColor Yellow
    exit 1
}

Write-Host '=== 1) 安装最新 APK ===' -ForegroundColor Cyan
& $Adb install -r $Apk
& $Adb shell dumpsys package com.app.m3expressive 2>$null | Select-String 'versionName|versionCode' | Select-Object -First 2

Write-Host '=== 2) 启动并截图 ===' -ForegroundColor Cyan
& $Adb shell am force-stop com.app.m3expressive
& $Adb shell am start -n com.app.m3expressive/.MainActivity | Out-Null
Start-Sleep -Seconds 11
& $Adb shell screencap -p /sdcard/verify-home.png
& $Adb pull /sdcard/verify-home.png screenshots-device/verify-home.png 2>$null | Out-Null

# 底栏几何：屏幕 1280x2800，底栏大约在 y≈2660，三格中心 x ≈ 213 / 640 / 1060
$screen = (& $Adb shell wm size 2>$null) -join ' '
Write-Host "屏幕: $screen"

function Get-TopText {
    & $Adb shell rm -f /sdcard/t.xml | Out-Null
    & $Adb shell uiautomator dump /sdcard/t.xml | Out-Null
    & $Adb pull /sdcard/t.xml screenshots-device/t.xml 2>$null | Out-Null
    if (-not (Test-Path 'screenshots-device/t.xml')) { return '(dump 失败)' }
    $xml = Get-Content 'screenshots-device/t.xml' -Raw -Encoding UTF8
    return (([regex]::Matches($xml, 'text="([^"]{2,14})"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique -First 4) -join ' / ')
}

Write-Host '=== 3) 底栏点按（三格） ===' -ForegroundColor Cyan
foreach ($p in @(@(1060, '设置'), @(640, '搜索'), @(213, '首页'))) {
    & $Adb shell input tap $p[0] 2660 | Out-Null
    Start-Sleep -Seconds 3
    Write-Host ("点 {0} → {1}" -f $p[1], (Get-TopText))
}

Write-Host '=== 4) 底栏拖拽（从左侧拖到右侧） ===' -ForegroundColor Cyan
& $Adb shell input swipe 213 2660 1060 2660 600 | Out-Null
Start-Sleep -Seconds 3
Write-Host ("拖拽后 → {0}" -f (Get-TopText))

Write-Host '=== 5) 流体云 / 实况通知 ===' -ForegroundColor Cyan
& $Adb shell dumpsys notification --noredact 2>$null | Select-String -Pattern 'com.app.m3expressive|promotedOngoing|shortCriticalText' | Select-Object -First 6

Write-Host '=== 完成 ===' -ForegroundColor Green
Write-Host '截图：screenshots-device/verify-home.png'
Write-Host '请人工确认：底栏是否可见、点按是否单次切换、拖拽是否跟手、顶栏是否让开状态栏'
