<?php
/**
 * PHP script để list tất cả file ảnh trong thư mục images/
 * Truy cập: http://localhost:8000/list-images.php
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$imagesDir = __DIR__ . '/images';
// normalized, no leading dots, all lowercase
$allowedExtensions = ['heic', 'jpg', 'jpeg', 'png', 'webp', 'gif'];
$images = [];

if (is_dir($imagesDir)) {
    $files = scandir($imagesDir);
    foreach ($files as $file) {
        if ($file === '.' || $file === '..') continue;
        
        $extension = strtolower(pathinfo($file, PATHINFO_EXTENSION)); // returns 'jpg' (no dot)
        if (in_array($extension, $allowedExtensions)) {
            $images[] = $file;
        }
    }
}

echo json_encode(['images' => $images]);

