param([string]$Date = ([DateTime]::Now.ToString('yyyy-MM-dd',[cultureinfo]::InvariantCulture)))
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$cache = Join-Path $root 'private-cache'
New-Item -ItemType Directory -Force -Path $cache | Out-Null
function Download-Json([string[]]$Urls, [string]$Name) {
  $failures = @()
  $curlTool = Get-Command curl -CommandType Application -ErrorAction SilentlyContinue
  if (-not $curlTool) { $curlTool = Get-Command curl.exe -CommandType Application -ErrorAction SilentlyContinue }
  foreach ($candidate in $Urls) {
    $sourceHost = ([uri]$candidate).Host
    Write-Output "Downloading $Name from $sourceHost ..."
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $tempFile = Join-Path $cache ($Name + '.download')
    try {
      if ($curlTool) {
        $PSNativeCommandUseErrorActionPreference = $false
        $detail = & $curlTool.Source --ipv4 --http1.1 --fail --silent --show-error --connect-timeout 10 --max-time 40 --output $tempFile $candidate 2>&1
        if ($LASTEXITCODE -ne 0) { throw "curl exit $LASTEXITCODE : $detail" }
        $body = [IO.File]::ReadAllText($tempFile)
      } else {
        $response = Invoke-WebRequest -Uri $candidate -TimeoutSec 40
        $body = if ($response.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($response.Content) } else { $response.Content }
      }
      $parsed = $body | ConvertFrom-Json
      if ($Name -eq 'latest.json' -and -not $parsed.stations.Count) { throw 'Latest response has no stations' }
      if ($Name -eq 'history.json' -and ($parsed.result -ne 'OK' -or -not @($parsed.stations | Where-Object { $_.data.Count -gt 0 }).Count)) { throw 'History response has no hourly data' }
      if ($Name -eq 'rooms.json' -and (-not ($parsed -is [array]) -or -not $parsed.Count)) { throw 'Cleanroom response is not a room list' }
      [IO.File]::WriteAllText((Join-Path $cache $Name),$body)
      Write-Output ("OK: $Name in {0:N1}s" -f $timer.Elapsed.TotalSeconds)
      return
    } catch {
      $reason = $_.Exception.Message
      $failures += "$sourceHost : $reason"
      Write-Warning "Could not download $Name from $sourceHost : $reason"
    }
  }
  throw ("Source download failed: $Name. " + ($failures -join ' | '))
}
Download-Json @('https://air4thai.pcd.go.th/forweb/getAQI_JSON.php','https://air4thai.com/forweb/getAQI_JSON.php') 'latest.json'
$latest = Get-Content -Raw (Join-Path $cache 'latest.json') | ConvertFrom-Json
$stationIds = @($latest.stations | Where-Object { $_.areaTH -match 'ขอนแก่น|มหาสารคาม|ร้อยเอ็ด|กาฬสิน' } | ForEach-Object stationID) -join ','
if (-not $stationIds) { throw 'Region 7 stations missing' }
$start = [datetime]::ParseExact($Date,'yyyy-MM-dd',[cultureinfo]::InvariantCulture).AddDays(-8).ToString('yyyy-MM-dd',[cultureinfo]::InvariantCulture)
Write-Output "Requested date range (Gregorian): $start to $Date"
$query = "stationID=$stationIds&param=PM25&type=hr&sdate=$start&edate=$Date&stime=00&etime=23"
Download-Json @("https://air4thai.pcd.go.th/forweb/getHistoryData.php?$query","https://air4thai.com/forweb/getHistoryData.php?$query") 'history.json'
Download-Json @('https://podfoon.anamai.moph.go.th/api/cleanroom/roomlists') 'rooms.json'
[IO.File]::WriteAllText((Join-Path $cache 'fetched.json'),(@{date=$Date;fetchedAt=[DateTimeOffset]::UtcNow.ToString('o')}|ConvertTo-Json))
Write-Output 'Downloaded Air4Thai and cleanroom sources. Raw records remain in private-cache.'
