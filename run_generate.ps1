& "D:\knowsamvidhan\node_modules\.bin\prisma" generate 2>&1 | Out-File -FilePath "D:\knowsamvidhan\prisma_generate_output.txt" -Encoding utf8
Write-Output "Done: exit code $LASTEXITCODE"