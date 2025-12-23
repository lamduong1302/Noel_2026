/**
 * Script Node.js để tự động tạo file images-list.json
 * Chạy: node generate-images-list.js
 * 
 * Script này sẽ tự động quét thư mục images/ và tạo danh sách file ảnh
 * Chạy lại script này mỗi khi bạn thêm ảnh mới vào thư mục
 */

const fs = require('fs');
const path = require('path');

const imagesDir = path.join(__dirname, 'images');
const outputFile = path.join(imagesDir, 'images-list.json');

// Các định dạng ảnh được hỗ trợ
const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

// Tạo thư mục nếu chưa có
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
    console.log('📁 Đã tạo thư mục images/');
}

try {
    // Đọc tất cả file trong thư mục images/
    const files = fs.readdirSync(imagesDir);
    
    // Lọc chỉ các file ảnh (bỏ qua các file hệ thống)
    const imageFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        const isImage = imageExtensions.includes(ext);
        const isSystemFile = file === 'images-list.json' || file === 'README.md';
        return isImage && !isSystemFile;
    });
    
    if (imageFiles.length === 0) {
        console.log('⚠️  Không tìm thấy file ảnh nào trong thư mục images/');
        console.log('💡 Hãy đặt các file ảnh (.jpg, .png, .webp, .gif) vào thư mục images/');
        return;
    }
    
    // Tạo object JSON
    const jsonData = {
        images: imageFiles.sort() // Sắp xếp theo tên
    };
    
    // Ghi vào file
    fs.writeFileSync(outputFile, JSON.stringify(jsonData, null, 2));
    
    console.log(`✅ Đã tự động quét và tạo images-list.json với ${imageFiles.length} ảnh:`);
    imageFiles.forEach((file, index) => {
        console.log(`   ${index + 1}. ${file}`);
    });
    console.log('\n💡 Tip: Chạy lại script này mỗi khi bạn thêm ảnh mới!');
    
} catch (error) {
    console.error('❌ Lỗi:', error.message);
    process.exit(1);
}

