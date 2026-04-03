# QR Scanner Debug Guide

## Current Issue: "Scanner Issue Detected" Error

You're seeing this error message because the QR scanner is encountering issues. Here's how to debug and fix it:

### Step 1: Check Browser Console
1. Open the StudentScan page in your browser
2. Press F12 to open Developer Tools
3. Go to the Console tab
4. Look for messages like:
   - `QR Scanner Error: [error message]` - Shows what error the scanner is encountering
   - `QR Code Scanned Successfully: [data]` - Shows when QR codes are detected

### Step 2: Common Issues & Solutions

#### Issue: "Camera permission denied"
**Cause:** Browser blocked camera access
**Solution:**
1. Click the camera icon in the address bar
2. Allow camera access
3. Refresh the page

#### Issue: "QR code not detected"
**Cause:** QR code not visible or too far/small
**Solution:**
1. Ensure QR code is clearly visible on screen
2. Hold device 6-12 inches from camera
3. Make sure lighting is good
4. Try different angles

#### Issue: "No MultiFormat Readers were able to detect the code"
**Cause:** QR code generation issue or corrupted code
**Solution:**
1. Generate a new session in TeacherDashboard
2. Try scanning with external QR scanner app (Google Lens)
3. If external scanner works, the QR code is fine - issue is with web scanner
4. If external scanner fails, check server logs for QR generation errors

### Step 3: Test QR Code Generation
1. Go to TeacherDashboard
2. Create a new session
3. Take a screenshot of the QR code
4. Open Google Lens or any QR scanner app
5. Scan the screenshot
6. Should show JSON data with `sessionId`, `expiresAt`, `signature`

### Step 4: Manual Fallback
If scanning doesn't work:
1. In TeacherDashboard, click "Copy Payload to Share"
2. In StudentScan, paste the payload into the manual entry field
3. Click "Submit Payload"

### Step 5: Check Server Status
Ensure the server is running:
```bash
# Check if server is running on port 5000
curl http://localhost:5000/api/health
```

### Debug Information Added
- Console logging for scanner errors and successes
- More specific error messages for different failure types
- Improved error UI with contextual help

Try these steps and check the browser console for the debug messages to identify the exact issue.