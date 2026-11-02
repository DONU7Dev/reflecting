# Reflecting
Offline, password-protected inventory worksheets. Data never leaves the device.
## Get the installers (no coding)
1. Create a free GitHub account and a new private repository; upload all files in this folder.
2. Open the **Actions** tab, choose **Build installers**, click **Run workflow**.
3. In ~15 minutes download the Windows (.exe/.msi) and Mac (.dmg) files from the finished run.
Unsigned installers show an "unknown publisher" warning (Windows: More info > Run anyway; Mac: right-click > Open).
## Where data lives
One encrypted file, `vault.json`, in the app's data folder on the user's device (XChaCha20-Poly1305; key from Argon2id).
