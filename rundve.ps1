cd C:\Users\esainte\DocumentosOFFLINE\GitHub\chat
Start-Process -NoNewWindow -FilePath "cmd.exe" -ArgumentList "/c","cd /d C:\Users\esainte\DocumentosOFFLINE\GitHub\chat && pnpm dev --port 5179 > devout.log 2> deverr.log"
Start-Sleep -Seconds 30
try {
  $r = Invoke-WebRequest -Uri "http://localhost:5179/" -UseBasicParsing -TimeoutSec 12 -ErrorAction Stop
  Write-Output ("HTTP " + $r.StatusCode)
} catch {
  Write-Output ("HTTP ERR: " + $_.Exception.Message)
}
Write-Output "=== devout tail ==="
Get-Content devout.log -Encoding utf8 -Tail 50
Write-Output "=== deverr tail ==="
Get-Content deverr.log -Encoding utf8 -Tail 50
