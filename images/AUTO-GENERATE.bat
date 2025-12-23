@echo off
chcp 65001 >nul
echo ========================================
echo   TỰ ĐỘNG TẠO DANH SÁCH ẢNH
echo ========================================
echo.
cd ..
node generate-images-list.js
echo.
echo ✅ Hoàn thành! Nhấn phím bất kỳ để đóng...
pause >nul

