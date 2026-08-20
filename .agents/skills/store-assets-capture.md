---
name: store-assets-capture
description: Guide for capturing authenticated and unauthenticated screens using Playwright or Android adb.
---
# Screen Capture Workflow
1. Use `list_screens` tool to discover available routes.
2. Use `capture_web_screen` with optional credentials (email/password) to authenticate and capture the internal authenticated app UI.
3. For Android native flows, use `capture_android_screen`.
