# 📁 Thư mục ảnh

## 🎯 Cách sử dụng ĐƠN GIẢN NHẤT:

### Bước 1: Đặt ảnh vào thư mục này
- Copy/paste các file ảnh (.jpg, .png, .webp, .gif) vào thư mục `images/`
- Đặt tên ảnh **bất kỳ** (không cần đặt tên đặc biệt)

### Bước 2: Chạy script để tự động quét

**Windows:** Double-click file `AUTO-GENERATE.bat`

**Hoặc chạy lệnh:**
```bash
node generate-images-list.js
```

Script sẽ tự động:
- ✅ Quét tất cả file ảnh trong thư mục
- ✅ Tạo file `images-list.json` với danh sách ảnh
- ✅ Hệ thống sẽ tự động load tất cả ảnh

### ⚡ Tự động hoàn toàn (Advanced)

Nếu bạn muốn tự động 100%, chạy server Node.js:

```bash
node list-images.js
```

Server sẽ tự động quét thư mục mỗi khi có request. Không cần chạy script mỗi lần thêm ảnh!

---

## 📝 Lưu ý:

- ✅ Định dạng hỗ trợ: .jpg, .jpeg, .png, .webp, .gif
- ✅ Đặt tên ảnh bất kỳ, không cần theo quy tắc
- ✅ Chạy lại script mỗi khi thêm ảnh mới (hoặc dùng server tự động)
- ⚠️ Cần chạy qua local server để tránh lỗi CORS

## 🚀 Khởi động:

1. Đặt ảnh vào thư mục này
2. Chạy: `node generate-images-list.js`
3. Mở `noel_v2.html` qua local server

Xong! 🎉
