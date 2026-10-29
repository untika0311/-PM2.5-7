param([string]$Date = ([DateTime]::Now.ToString('yyyy-MM-dd',[cultureinfo]::InvariantCulture)))
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$cache = Join-Path $root 'private-cache'
New-Item -ItemType Directory -Force -Path $cache | Out-Null
function Download-Json($Url, $Name) {
  $lastError = $null
  for ($attempt=0; $attempt -lt 3; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $Url -TimeoutSec 60
      $body = if ($response.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($response.Content) } else { $response.Content }
      $null = $body | ConvertFrom-Json
      [IO.File]::WriteAllText((Join-Path $cache $Name),$body)
      return
    } catch { $lastError = $_; if ($attempt -lt 2) { Start-Sleep -Seconds 2 } }
  }
  throw "Source download failed: $Name"
}
Download-Json 'https://air4thai.com/forweb/getAQI_JSON.php' 'latest.json'
$latest = Get-Content -Raw (Join-Path $cache 'latest.json') | ConvertFrom-Json
$stationIds = @($latest.stations | Where-Object { $_.areaTH -match 'ขอนแก่น|มหาสารคาม|ร้อยเอ็ด|กาฬสิน' } | ForEach-Object stationID) -join ','
if (-not $stationIds) { throw 'Region 7 stations missing' }
$start = [datetime]::ParseExact($Date,'yyyy-MM-dd',[cultureinfo]::InvariantCulture).AddDays(-8).ToString('yyyy-MM-dd',[cultureinfo]::InvariantCulture)
Download-Json "https://air4thai.com/forweb/getHistoryData.php?stationID=$stationIds&param=PM25&type=hr&sdate=$start&edate=$Date&stime=00&etime=23" 'history.json'
Download-Json 'https://podfoon.anamai.moph.go.th/api/cleanroom/roomlists' 'rooms.json'
[IO.File]::WriteAllText((Join-Path $cache 'fetched.json'),(@{date=$Date;fetchedAt=[DateTimeOffset]::UtcNow.ToString('o')}|ConvertTo-Json))
Write-Output 'Downloaded Air4Thai and cleanroom sources. Raw records remain in private-cache.'
