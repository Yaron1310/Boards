# 1. Get the latest info from the server
git fetch origin

# 2. Identify the latest branch name
$latestBranch = (git branch -r --sort=-committerdate | Select-Object -First 1).Replace("origin/", "").Trim()

# 3. Save the commit ID we are at RIGHT NOW
$beforeCommit = git rev-parse HEAD

Write-Host "Target Branch: $latestBranch" -ForegroundColor Yellow

# 4. Switch to the branch (if not already there)
git checkout $latestBranch

# 5. Pull the latest code (This moves HEAD forward to match origin)
git pull origin $latestBranch

# 6. Save the new commit ID
$afterCommit = git rev-parse HEAD

# 7. Compare and report
if ($beforeCommit -eq $afterCommit) {
    Write-Host "`nNo new changes. Everything is already up to date." -ForegroundColor Green
} else {
    Write-Host "`n=== New Commits ===" -ForegroundColor Cyan
    git log --oneline "$beforeCommit..$afterCommit"

    Write-Host "`n=== Changed Files ===" -ForegroundColor Cyan
    git diff --stat "$beforeCommit..$afterCommit"
}

Read-Host "`nPress Enter to close"
