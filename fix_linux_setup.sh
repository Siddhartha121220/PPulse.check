#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
ANDROID_DIR="$PROJECT_DIR/android"

echo "🔧 PPulse.check - Linux Migration Fix Script"
echo "============================================="
echo "Project: $PROJECT_DIR"
echo ""

# ─── 1. Clean Windows Gradle artifacts ─────────────────────────────────────
echo "📦 Step 1: Cleaning Windows Gradle artifacts..."
rm -rf "$ANDROID_DIR/.gradle"
rm -rf "$ANDROID_DIR/build"
rm -rf "$ANDROID_DIR/app/build"
rm -rf "$ANDROID_DIR/.kotlin"
rm -rf "$ANDROID_DIR/.idea"
echo "   ✅ Cleaned .gradle, build, app/build, .kotlin, .idea"

# ─── 2. Remove stale Windows log files ─────────────────────────────────────
echo ""
echo "🗑️  Step 2: Removing stale Windows log files..."
rm -f "$ANDROID_DIR/build_error.txt"
rm -f "$ANDROID_DIR/build_errors.log"
rm -f "$ANDROID_DIR/build_errors_utf8.txt"
rm -f "$ANDROID_DIR/build_info.log"
rm -f "$ANDROID_DIR/build_log.txt"
rm -f "$ANDROID_DIR/gradle_info_log.txt"
echo "   ✅ Removed Windows build logs"

# ─── 3. Fix CRLF line endings ────────────────────────────────────────────
echo ""
echo "📝 Step 3: Fixing CRLF line endings..."
find "$PROJECT_DIR/src" -name "*.ts" -o -name "*.tsx" -o -name "*.js" | xargs sed -i 's/\r//' 2>/dev/null || true
sed -i 's/\r//' "$PROJECT_DIR/tailwind.config.js" 2>/dev/null || true
sed -i 's/\r//' "$PROJECT_DIR/metro.config.js" 2>/dev/null || true
sed -i 's/\r//' "$PROJECT_DIR/babel.config.js" 2>/dev/null || true
sed -i 's/\r//' "$PROJECT_DIR/index.js" 2>/dev/null || true
sed -i 's/\r//' "$PROJECT_DIR/App.tsx" 2>/dev/null || true
# Also fix gradlew just in case
dos2unix "$ANDROID_DIR/gradlew" 2>/dev/null || sed -i 's/\r//' "$ANDROID_DIR/gradlew"
chmod +x "$ANDROID_DIR/gradlew"
echo "   ✅ Fixed CRLF line endings in src/, config files, and gradlew"

# ─── 4. Ensure gradlew is executable ─────────────────────────────────────
echo ""
echo "🔑 Step 4: Ensuring gradlew is executable..."
chmod +x "$ANDROID_DIR/gradlew"
echo "   ✅ gradlew is now executable"

# ─── 5. Clear Metro bundler cache ────────────────────────────────────────
echo ""
echo "🚀 Step 5: Clearing Metro bundler cache..."
rm -rf /tmp/metro-* 2>/dev/null || true
rm -rf /tmp/react-* 2>/dev/null || true
rm -rf /tmp/haste-* 2>/dev/null || true
echo "   ✅ Cleared Metro cache"

# ─── 6. Verify Android SDK path ──────────────────────────────────────────
echo ""
echo "🤖 Step 6: Verifying Android SDK..."
SDK_PATH=$(grep "sdk.dir=" "$ANDROID_DIR/local.properties" 2>/dev/null | cut -d'=' -f2)
if [ -d "$SDK_PATH" ]; then
  echo "   ✅ Android SDK found at: $SDK_PATH"
else
  echo "   ⚠️  SDK path in local.properties: '$SDK_PATH' - verifying..."
  if [ -d "$HOME/Android/Sdk" ]; then
    echo "sdk.dir=$HOME/Android/Sdk" > "$ANDROID_DIR/local.properties"
    echo "   ✅ Updated local.properties to: $HOME/Android/Sdk"
  else
    echo "   ❌ Android SDK not found! Set sdk.dir in android/local.properties"
  fi
fi

# ─── 7. Check watchman ───────────────────────────────────────────────────
echo ""
echo "👁️  Step 7: Checking watchman..."
if command -v watchman &>/dev/null; then
  echo "   ✅ watchman is installed: $(watchman --version)"
else
  echo "   ⚠️  watchman is NOT installed. Install it for better Metro performance:"
  echo "      sudo apt-get install -y watchman"
  echo "   Metro will still work without it (uses fallback polling)"
fi

# ─── 8. Check Java ───────────────────────────────────────────────────────
echo ""
echo "☕ Step 8: Checking Java..."
if command -v java &>/dev/null; then
  echo "   ✅ Java: $(java -version 2>&1 | head -1)"
else
  echo "   ❌ Java not found! Install JDK 17:"
  echo "      sudo apt-get install -y openjdk-17-jdk"
fi

echo ""
echo "============================================="
echo "✅ Fix script complete!"
echo ""
echo "Next steps to run the app:"
echo "  1. In one terminal:  npm run start"
echo "  2. In another:       npm run android"
echo ""
echo "If Metro has issues, start with cache clear:"
echo "  npm run start -- --reset-cache"
