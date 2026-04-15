# Define your branch name once
$branch = "main"

# 1. Stage and commit
git add .
git commit -m "Local dev edits"

# 2. Update remote tracking info
Write-Host "Fetching latest info for $branch..." -ForegroundColor Cyan
git fetch origin

# 3. Show the Report
# This compares your local version ($branch) to the server version (origin/$branch)
Write-Host "--- DIFFERENCE REPORT (Local vs Remote) ---" -ForegroundColor Yellow
git diff --stat $branch origin/$branch

# 4. Push to the specific branch
git push origin $branch

Read-Host "Press Enter to close"