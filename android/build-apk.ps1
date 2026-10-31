# CalCheck APK 빌드 스크립트 (Windows PowerShell)
# Android Studio를 열지 않고 Gradle만으로 APK를 만든다. 더블클릭용 build-apk.bat이 이 파일을 실행한다.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $root "build-log.txt"
Start-Transcript -Path $log -Force | Out-Null
try {
  Write-Host "== CalCheck APK build =="
  Write-Host "project: $root"

  # 1) JDK: Android Studio에 딸린 JBR 우선, 없으면 C:\Program Files\Android\jdk\*
  $jdk = "C:\Program Files\Android\Android Studio\jbr"
  if (-not (Test-Path "$jdk\bin\java.exe")) {
    $cand = Get-ChildItem "C:\Program Files\Android\jdk" -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path "$($_.FullName)\bin\java.exe" } | Select-Object -First 1
    if ($cand) { $jdk = $cand.FullName }
  }
  if (-not (Test-Path "$jdk\bin\java.exe")) { throw "JDK를 찾지 못했습니다 (Android Studio jbr 없음)" }
  $env:JAVA_HOME = $jdk
  $env:Path = "$jdk\bin;" + $env:Path
  Write-Host "JAVA_HOME = $jdk"
  # java/gradle 같은 네이티브 명령은 stderr에 정상 출력을 쓰므로, 그동안은 "에러 즉시 중단"을 끈다
  $ErrorActionPreference = "Continue"
  & java -version 2>&1 | ForEach-Object { Write-Host "$_" }
  $ErrorActionPreference = "Stop"

  # 2) Android SDK
  $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
  if (-not (Test-Path $sdk)) { throw "Android SDK를 찾지 못했습니다: $sdk" }
  $env:ANDROID_HOME = $sdk
  $env:ANDROID_SDK_ROOT = $sdk
  Set-Content -Path (Join-Path $root "local.properties") -Value ("sdk.dir=" + ($sdk -replace "\\", "\\\\")) -Encoding ASCII
  Write-Host "ANDROID_HOME = $sdk"

  # 라이선스 동의 (build-tools/platform 34가 없으면 AGP가 자동으로 받는데, 그러려면 동의가 필요)
  $sdkmgr = Get-ChildItem "$sdk\cmdline-tools\*\bin\sdkmanager.bat" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($sdkmgr) {
    Write-Host "accepting SDK licenses..."
    $yes = ("y`n" * 30)
    $ErrorActionPreference = "Continue"
    $yes | & $sdkmgr.FullName --licenses 2>&1 | Select-Object -Last 3 | ForEach-Object { Write-Host "$_" }
    $ErrorActionPreference = "Stop"
  } else {
    Write-Host "(cmdline-tools 없음 — 라이선스 단계 건너뜀. platform-34 / build-tools 34가 이미 있어야 함)"
  }

  # 3) Gradle 8.7 (한 번만 받는다)
  $gdir = Join-Path $env:USERPROFILE ".gradle\dists-calcheck"
  $gbin = Join-Path $gdir "gradle-8.7\bin\gradle.bat"
  if (-not (Test-Path $gbin)) {
    New-Item -ItemType Directory -Force -Path $gdir | Out-Null
    $zip = Join-Path $gdir "gradle-8.7-bin.zip"
    Write-Host "downloading Gradle 8.7 (~130MB)..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri "https://services.gradle.org/distributions/gradle-8.7-bin.zip" -OutFile $zip
    Write-Host "extracting..."
    Expand-Archive -Path $zip -DestinationPath $gdir -Force
    Remove-Item $zip -Force
  }
  Write-Host "gradle = $gbin"

  # 4) 빌드
  Set-Location $root
  Write-Host "building (첫 빌드는 의존성 다운로드로 몇 분 걸림)..."
  $ErrorActionPreference = "Continue"
  & $gbin --no-daemon assembleDebug 2>&1 | ForEach-Object { Write-Host "$_" }
  $code = $LASTEXITCODE
  $ErrorActionPreference = "Stop"
  if ($code -ne 0) { throw "gradle 빌드 실패 (exit $code)" }

  $apk = Join-Path $root "app\build\outputs\apk\debug\app-debug.apk"
  if (-not (Test-Path $apk)) { throw "APK가 생성되지 않았습니다" }
  $out = Join-Path (Split-Path -Parent $root) "CalCheck.apk"
  Copy-Item $apk $out -Force
  Write-Host ""
  Write-Host "== DONE: $out =="
  "OK $out" | Set-Content (Join-Path $root "build-result.txt")
} catch {
  Write-Host ""
  Write-Host "== FAILED: $($_.Exception.Message) =="
  "FAIL $($_.Exception.Message)" | Set-Content (Join-Path $root "build-result.txt")
} finally {
  Stop-Transcript | Out-Null
}
