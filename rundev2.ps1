cd C:\Users\esainte\DocumentosOFFLINE\GitHub\chat
Remove-Item -Force dev.log, result.txt -ErrorAction SilentlyContinue
Start-Process -NoNewWindow -FilePath "cmd.exe" -ArgumentList "/c","cd /d C:\Users\esainte\DocumentosOFFLINE\GitHub\chat && pnpm dev --port 5180 > dev.log 2>&1"
Start-Sleep -Seconds 35
try {
  $r = Invoke-WebRequest -Uri "http://localhost:5180/chat" -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 60 -ErrorAction Stop
  "HTTP " + $r.StatusCode | Out-File -Append result.txt
} catch {
  $msg = $_.Exception.Message
  "HTTP ERR: $msg" | Out-File -Append result.txt
}
"=== dev.log tail ===" | Out-File -Append result.txt
Get-Content dev.log -Encoding utf8 -Tail 70 | Out-File -Append result.txt
