# --- CONFIGURATION ---
$targetBranch = "claude/recaptcha-fix"  # Set your specific branch name here
# ---------------------

Write-Host "Fetching latest changes..."
git fetch origin

Write-Host "Target branch is: $targetBranch"

$current = git branch --show-current

# Switch if we aren't already on the target branch
if ($current -ne $targetBranch) {
    Write-Host "Switching to $targetBranch..."
    # If the branch doesn't exist locally yet, this will track the remote version
    git checkout $targetBranch 
}

Write-Host "Pulling latest changes from origin/$targetBranch..."
git pull origin $targetBranch 

Write-Host ""
Write-Host "Done."
Read-Host "Press Enter to close"