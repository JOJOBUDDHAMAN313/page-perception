$ErrorActionPreference = "SilentlyContinue"
$root = "C:\New folder\perception"
$cf = "C:\Users\Owner\.local\cf\cloudflared.exe"
$log = "$root\keepalive.log"
$cfLog = "$env:TEMP\cf-current.log"

function Log($m) { "$(Get-Date -Format o) $m" | Add-Content $log }

function EndpointUp {
  try { return (Invoke-WebRequest "http://127.0.0.1:8790/health" -UseBasicParsing -TimeoutSec 4).StatusCode -eq 200 } catch { return $false }
}
function TunnelPid { (Get-Process cloudflared -ErrorAction SilentlyContinue | Select-Object -First 1).Id }
function TunnelUrl {
  if (-not (Test-Path $cfLog)) { return "" }
  (Select-String -Path $cfLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches |
    ForEach-Object { $_.Matches.Value } | Select-Object -Last 1)
}
function Publish($url) {
  if ((Get-Content "$root\PUBLIC_URL.txt" -ErrorAction SilentlyContinue) -eq $url) { return }
  Log "publish $url"
  Set-Content "$root\PUBLIC_URL.txt" $url
  $r = Get-Content "$root\README.md" -Raw
  $r = $r -replace 'https://[a-z0-9-]+\.trycloudflare\.com', $url
  $r | Set-Content "$root\README.md"
  Push-Location $root
  git add README.md PUBLIC_URL.txt | Out-Null
  git -c user.email=josoliz1998@gmail.com -c user.name=JOJOBUDDHAMAN313 commit -q -m "keepalive: publish $url" | Out-Null
  git push -q origin main | Out-Null
  Pop-Location
}

Log "start"
while ($true) {
  if (-not (EndpointUp)) {
    Log "endpoint restart"
    Start-Process node -ArgumentList "endpoint.mjs" -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardError "$env:TEMP\ep.err" -RedirectStandardOutput "$env:TEMP\ep.out"
  }
  if (-not (TunnelPid)) {
    Log "tunnel restart"
    if (Test-Path $cfLog) { Remove-Item $cfLog }
    Start-Process $cf -ArgumentList "tunnel","--url","http://127.0.0.1:8790","--no-autoupdate" -RedirectStandardError $cfLog -RedirectStandardOutput "$env:TEMP\cf-current.out" -WindowStyle Hidden
    Start-Sleep -Seconds 12
  }
  $u = TunnelUrl
  if ($u) { Publish $u }
  Start-Sleep -Seconds 40
}
