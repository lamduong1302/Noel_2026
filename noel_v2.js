import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'; 
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// --- CẤU HÌNH ---
const CONFIG = {
    colors: {
        bg: 0x000000, 
        champagneGold: 0xffd966, 
        deepGreen: 0x03180a,     
        accentRed: 0x990000,     
    },
    particles: {
        count: 1500,     
        dustCount: 2500, 
        treeHeight: 24,  
        treeRadius: 8    
    },
    camera: {
        z: 50 
    },
    snow: {
        count: 2000, // Số lượng hạt tuyết
        speed: 0.5, // Tốc độ rơi
        size: 2.0 // Kích thước hạt tuyết
    }
};

const STATE = {
    mode: 'TREE', 
    focusIndex: -1, 
    focusTarget: null,
    hand: { detected: false, x: 0, y: 0 },
    rotation: { x: 0, y: 0 },
    photoWallMode: false, // Chế độ Photo Wall
    gestureState: { 
        pinchFrames: 0, // Đếm số frame liên tiếp có cử chỉ véo
        requiredFrames: 8, // Số frame cần thiết để xác nhận cử chỉ (debouncing)
        lastMode: 'TREE' // Lưu chế độ trước đó để phát âm thanh khi thay đổi
    }
};

let scene, camera, renderer, composer;
let mainGroup; 
let clock = new THREE.Clock();
let particleSystem = []; 
let photoMeshGroup = new THREE.Group();
let handLandmarker, video, webcamCanvas, webcamCtx;
let caneTexture;
let snowSystem = null; // Hệ thống tuyết rơi
let snowVelocities = []; // Vận tốc của từng hạt tuyết
let audioListener, backgroundMusic; // Âm thanh nền
let bloomPass; // Bloom effect để có thể bật/tắt
let soundEffects = {}; // Lưu trữ các sound effect 

/**
 * Hàm khởi tạo chính - thiết lập toàn bộ ứng dụng
 * Gọi tất cả các hàm setup và bắt đầu animation
 */
async function init() {
    initThree();
    setupEnvironment(); 
    setupLights();
    createTextures();
    createParticles(); 
    createDust();
    createSnowfall(); // Thêm hiệu ứng tuyết rơi
    setupPostProcessing();
    setupEvents();
    setupAudio(); // Thiết lập âm thanh (tùy chọn)
    await initMediaPipe();
    
    // Tự động load ảnh từ thư mục images/
    await loadImagesFromDirectory();
    
    const loader = document.getElementById('loader');
    loader.style.opacity = 0;
    setTimeout(() => loader.remove(), 800);

    animate();
}

/**
 * Khởi tạo Three.js: Scene, Camera, Renderer
 * Thiết lập môi trường cơ bản cho 3D
 */
function initThree() {
    const container = document.getElementById('canvas-container');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.colors.bg);
    scene.fog = new THREE.FogExp2(CONFIG.colors.bg, 0.01); 

    camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, CONFIG.camera.z); 

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ReinhardToneMapping; 
    renderer.toneMappingExposure = 2.2; 
    container.appendChild(renderer.domElement);

    mainGroup = new THREE.Group();
    scene.add(mainGroup);
}

/**
 * Thiết lập môi trường ánh sáng cho scene
 * Tạo môi trường phản xạ ánh sáng để vật liệu trông thực tế hơn
 */
function setupEnvironment() {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
}

/**
 * Thiết lập hệ thống ánh sáng cho scene
 * Tạo các loại đèn khác nhau: ambient, point light, spot light, directional light
 */
function setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const innerLight = new THREE.PointLight(0xffaa00, 2, 20);
    innerLight.position.set(0, 5, 0);
    mainGroup.add(innerLight);

    const spotGold = new THREE.SpotLight(0xffcc66, 1200);
    spotGold.position.set(30, 40, 40);
    spotGold.angle = 0.5;
    spotGold.penumbra = 0.5;
    scene.add(spotGold);

    const spotBlue = new THREE.SpotLight(0x6688ff, 600);
    spotBlue.position.set(-30, 20, -30);
    scene.add(spotBlue);
    
    const fill = new THREE.DirectionalLight(0xffeebb, 0.8);
    fill.position.set(0, 0, 50);
    scene.add(fill);
}

/**
 * Thiết lập xử lý hậu kỳ (post-processing)
 * Tạo hiệu ứng bloom để làm cho các vật thể phát sáng
 */
function setupPostProcessing() {
    const renderScene = new RenderPass(scene, camera);
    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.7; 
    bloomPass.strength = 0.45; 
    bloomPass.radius = 0.4;

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);
}

/**
 * Bật/tắt hiệu ứng bloom
 * @param {boolean} enabled - Bật hoặc tắt bloom
 */
function setBloomEnabled(enabled) {
    if (bloomPass) {
        bloomPass.enabled = enabled;
    }
}

/**
 * Tạo texture cho kẹo gậy (candy cane)
 * Vẽ pattern sọc đỏ trắng trên canvas và chuyển thành texture
 */
function createTextures() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,0,128,128);
    ctx.fillStyle = '#880000'; 
    ctx.beginPath();
    for(let i=-128; i<256; i+=32) {
        ctx.moveTo(i, 0); ctx.lineTo(i+32, 128); ctx.lineTo(i+16, 128); ctx.lineTo(i-16, 0);
    }
    ctx.fill();
    caneTexture = new THREE.CanvasTexture(canvas);
    caneTexture.wrapS = THREE.RepeatWrapping;
    caneTexture.wrapT = THREE.RepeatWrapping;
    caneTexture.repeat.set(3, 3);
}

/**
 * Lớp Particle - Quản lý từng hạt/đối tượng trong scene
 * Xử lý vị trí, xoay, và scale cho các vật thể
 */
class Particle {
    constructor(mesh, type, isDust = false) {
        this.mesh = mesh;
        this.type = type;
        this.isDust = isDust;
        
        this.posTree = new THREE.Vector3();
        this.posScatter = new THREE.Vector3();
        this.posPhotoWall = new THREE.Vector3(); // Vị trí trong Photo Wall mode
        this.baseScale = mesh.scale.x; 

        // Individual Spin Speed
        // Photos spin slower to be readable
        const speedMult = (type === 'PHOTO') ? 0.3 : 2.0;

        this.spinSpeed = new THREE.Vector3(
            (Math.random() - 0.5) * speedMult,
            (Math.random() - 0.5) * speedMult,
            (Math.random() - 0.5) * speedMult
        );

        this.calculatePositions();
    }

    /**
     * Tính toán vị trí cho 2 chế độ: TREE (cây thông) và SCATTER (rải rác)
     * TREE: Tạo vị trí xoắn ốc để tạo hình cây thông
     * SCATTER: Tạo vị trí ngẫu nhiên trong không gian 3D hình cầu
     */
    calculatePositions() {
        // TREE: Tight Spiral
        const h = CONFIG.particles.treeHeight;
        const halfH = h / 2;
        let t = Math.random(); 
        t = Math.pow(t, 0.8); 
        const y = (t * h) - halfH;
        let rMax = CONFIG.particles.treeRadius * (1.0 - t); 
        if (rMax < 0.5) rMax = 0.5;
        const angle = t * 50 * Math.PI + Math.random() * Math.PI; 
        const r = rMax * (0.8 + Math.random() * 0.4); 
        this.posTree.set(Math.cos(angle) * r, y, Math.sin(angle) * r);

        // SCATTER: 3D Sphere
        let rScatter = this.isDust ? (12 + Math.random()*20) : (8 + Math.random()*12);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
                this.posScatter.set(
            rScatter * Math.sin(phi) * Math.cos(theta),
            rScatter * Math.sin(phi) * Math.sin(theta),
            rScatter * Math.cos(phi)
        );
        
        // PHOTOWALL: Sắp xếp ảnh thành vòng tròn quanh cây thông
        // Chỉ áp dụng cho photos, các particles khác vẫn dùng scatter
        if (this.type === 'PHOTO') {
            // Sẽ được tính lại khi có nhiều ảnh hơn
            this.posPhotoWall = this.posScatter.clone();
        } else {
            this.posPhotoWall = this.posScatter.clone();
        }
    }
    
    /**
     * Tính toán lại vị trí Photo Wall dựa trên số lượng ảnh
     * @param {number} index - Chỉ số của ảnh
     * @param {number} total - Tổng số ảnh
     */
    calculatePhotoWallPosition(index, total) {
        if (this.type !== 'PHOTO') return;
        
        const radius = 25; // Bán kính vòng tròn
        const angle = (index / total) * Math.PI * 2;
        const height = -5 + (index % 3) * 3; // Xếp thành 3 hàng ngang
        
        this.posPhotoWall.set(
            Math.cos(angle) * radius,
            height,
            Math.sin(angle) * radius
        );
    }

    /**
     * Cập nhật trạng thái của particle mỗi frame
     * @param {number} dt - Delta time (thời gian giữa các frame)
     * @param {string} mode - Chế độ hiện tại: 'TREE', 'SCATTER', hoặc 'FOCUS'
     * @param {THREE.Mesh} focusTargetMesh - Mesh đang được focus (nếu có)
     */
    update(dt, mode, focusTargetMesh) {
        let target = this.posTree;
        
        if (mode === 'SCATTER') target = this.posScatter;
        else if (STATE.photoWallMode && this.type === 'PHOTO') {
            // Photo Wall mode: chỉ ảnh được sắp xếp, các vật thể khác dùng scatter
            target = this.posPhotoWall;
        } else if (mode === 'FOCUS') {
            if (this.mesh === focusTargetMesh) {
                const desiredWorldPos = new THREE.Vector3(0, 2, 35);
                const invMatrix = new THREE.Matrix4().copy(mainGroup.matrixWorld).invert();
                target = desiredWorldPos.applyMatrix4(invMatrix);
            } else {
                target = this.posScatter;
            }
        }

        // Movement Easing
        const lerpSpeed = (mode === 'FOCUS' && this.mesh === focusTargetMesh) ? 5.0 : 2.0; 
        this.mesh.position.lerp(target, lerpSpeed * dt);

        // Rotation Logic - CRITICAL: Ensure spin happens in Scatter
        if (STATE.photoWallMode && this.type === 'PHOTO') {
            // Trong Photo Wall mode, ảnh hướng về camera
            this.mesh.lookAt(camera.position);
            this.mesh.rotation.y += Math.PI; // Xoay 180 độ để mặt ảnh hướng đúng
        } else if (mode === 'SCATTER') {
            this.mesh.rotation.x += this.spinSpeed.x * dt;
            this.mesh.rotation.y += this.spinSpeed.y * dt;
            this.mesh.rotation.z += this.spinSpeed.z * dt; // Added Z for more natural tumble
        } else if (mode === 'TREE') {
            // Reset rotations slowly
            this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, 0, dt);
            this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, 0, dt);
            this.mesh.rotation.y += 0.5 * dt; 
        }
        
        if (mode === 'FOCUS' && this.mesh === focusTargetMesh) {
            this.mesh.lookAt(camera.position); 
        }

        // Scale Logic
        let s = this.baseScale;
        if (this.isDust) {
            s = this.baseScale * (0.8 + 0.4 * Math.sin(clock.elapsedTime * 4 + this.mesh.id));
            if (mode === 'TREE') s = 0; 
        } else if (mode === 'SCATTER' && this.type === 'PHOTO') {
            // Large preview size in scatter
            s = this.baseScale * 2.5; 
        } else if (mode === 'FOCUS') {
            if (this.mesh === focusTargetMesh) s = 4.5; 
            else s = this.baseScale * 0.8; 
        }
        
        this.mesh.scale.lerp(new THREE.Vector3(s,s,s), 4*dt);
    }
}

// --- TẠO ĐỐI TƯỢNG ---

/**
 * Tạo các hạt/đối tượng cho cây thông Noel
 * Tạo nhiều loại vật thể: hộp xanh, hộp vàng, hình cầu vàng, hình cầu đỏ, kẹo gậy
 * Thêm ngôi sao ở đỉnh cây
 * 
 * LƯU Ý TỐI ƯU: Để cải thiện performance, có thể refactor để sử dụng THREE.InstancedMesh
 * thay vì tạo từng Mesh riêng lẻ. InstancedMesh giúp vẽ hàng ngàn vật thể giống nhau
 * chỉ với 1 draw call, giúp FPS ổn định hơn đáng kể.
 */
function createParticles() {
    const sphereGeo = new THREE.SphereGeometry(0.5, 32, 32); 
    const boxGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55); 
    const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, 0.3, 0),
        new THREE.Vector3(0.1, 0.5, 0), new THREE.Vector3(0.3, 0.4, 0)
    ]);
    const candyGeo = new THREE.TubeGeometry(curve, 16, 0.08, 8, false);

    const goldMat = new THREE.MeshStandardMaterial({
        color: CONFIG.colors.champagneGold,
        metalness: 1.0, roughness: 0.1,
        envMapIntensity: 2.0, 
        emissive: 0x443300,   
        emissiveIntensity: 0.3
    });

    const greenMat = new THREE.MeshStandardMaterial({
        color: CONFIG.colors.deepGreen,
        metalness: 0.2, roughness: 0.8,
        emissive: 0x002200,
        emissiveIntensity: 0.2 
    });

    const redMat = new THREE.MeshPhysicalMaterial({
        color: CONFIG.colors.accentRed,
        metalness: 0.3, roughness: 0.2, clearcoat: 1.0,
        emissive: 0x330000
    });
    
    const candyMat = new THREE.MeshStandardMaterial({ map: caneTexture, roughness: 0.4 });

    for (let i = 0; i < CONFIG.particles.count; i++) {
        const rand = Math.random();
        let mesh, type;
        
        if (rand < 0.40) {
            mesh = new THREE.Mesh(boxGeo, greenMat);
            type = 'BOX';
        } else if (rand < 0.70) {
            mesh = new THREE.Mesh(boxGeo, goldMat);
            type = 'GOLD_BOX';
        } else if (rand < 0.92) {
            mesh = new THREE.Mesh(sphereGeo, goldMat);
            type = 'GOLD_SPHERE';
        } else if (rand < 0.97) {
            mesh = new THREE.Mesh(sphereGeo, redMat);
            type = 'RED';
        } else {
            mesh = new THREE.Mesh(candyGeo, candyMat);
            type = 'CANE';
        }

        const s = 0.4 + Math.random() * 0.5;
        mesh.scale.set(s,s,s);
        mesh.rotation.set(Math.random()*6, Math.random()*6, Math.random()*6);
        
        mainGroup.add(mesh);
        particleSystem.push(new Particle(mesh, type, false));
    }

    const starGeo = new THREE.OctahedronGeometry(1.2, 0);
    const starMat = new THREE.MeshStandardMaterial({
        color: 0xffdd88, emissive: 0xffaa00, emissiveIntensity: 1.0,
        metalness: 1.0, roughness: 0
    });
    const star = new THREE.Mesh(starGeo, starMat);
    star.position.set(0, CONFIG.particles.treeHeight/2 + 1.2, 0);
    mainGroup.add(star);
    
    mainGroup.add(photoMeshGroup);
}

/**
 * Tạo các hạt bụi tuyết
 * Tạo nhiều hạt nhỏ để tạo hiệu ứng tuyết rơi
 */
function createDust() {
    const geo = new THREE.TetrahedronGeometry(0.08, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffeebb, transparent: true, opacity: 0.8 });
    
    for(let i=0; i<CONFIG.particles.dustCount; i++) {
         const mesh = new THREE.Mesh(geo, mat);
         mesh.scale.setScalar(0.5 + Math.random());
         mainGroup.add(mesh);
         particleSystem.push(new Particle(mesh, 'DUST', true));
    }
}

/**
 * Tạo hiệu ứng tuyết rơi với THREE.Points
 * Sử dụng texture alpha để tạo cảm giác tuyết rơi nhẹ nhàng
 */
function createSnowfall() {
    // Tạo texture cho hạt tuyết (hình tròn mờ)
    const snowTexture = createSnowTexture();
    
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const velocities = [];
    
    // Tạo vị trí ngẫu nhiên cho các hạt tuyết trong không gian rộng
    for (let i = 0; i < CONFIG.snow.count; i++) {
        positions.push(
            (Math.random() - 0.5) * 200, // x: -100 đến 100
            Math.random() * 200 + 50,    // y: 50 đến 250
            (Math.random() - 0.5) * 200  // z: -100 đến 100
        );
        // Vận tốc rơi ngẫu nhiên
        velocities.push(
            (Math.random() - 0.5) * 0.1, // drift x
            -CONFIG.snow.speed * (0.5 + Math.random() * 0.5), // rơi xuống
            (Math.random() - 0.5) * 0.1  // drift z
        );
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
        map: snowTexture,
        size: CONFIG.snow.size,
        transparent: true,
        opacity: 0.8,
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    
    snowSystem = new THREE.Points(geometry, material);
    snowVelocities = velocities;
    scene.add(snowSystem);
}

/**
 * Tạo texture cho hạt tuyết (hình tròn gradient)
 */
function createSnowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Tạo gradient từ trong ra ngoài
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

/**
 * Thêm ảnh vào scene
 * Tạo khung vàng và đặt ảnh bên trong
 * @param {THREE.Texture} texture - Texture của ảnh được load
 */
function addPhotoToScene(texture) {
    const frameGeo = new THREE.BoxGeometry(1.4, 1.4, 0.05);
    const frameMat = new THREE.MeshStandardMaterial({ color: CONFIG.colors.champagneGold, metalness: 1.0, roughness: 0.1 });
    const frame = new THREE.Mesh(frameGeo, frameMat);

    const photoGeo = new THREE.PlaneGeometry(1.2, 1.2);
    const photoMat = new THREE.MeshBasicMaterial({ map: texture });
    const photo = new THREE.Mesh(photoGeo, photoMat);
    photo.position.z = 0.04;

    const group = new THREE.Group();
    group.add(frame);
    group.add(photo);
    
    const s = 0.8;
    group.scale.set(s,s,s);
    
    photoMeshGroup.add(group);
    const photoParticle = new Particle(group, 'PHOTO', false);
    particleSystem.push(photoParticle);
    
    // Cập nhật lại vị trí Photo Wall cho tất cả ảnh
    updatePhotoWallLayout();
}

/**
 * Cập nhật layout Photo Wall - sắp xếp tất cả ảnh thành vòng tròn
 */
function updatePhotoWallLayout() {
    const photos = particleSystem.filter(p => p.type === 'PHOTO');
    photos.forEach((p, index) => {
        p.calculatePhotoWallPosition(index, photos.length);
    });
}

/**
 * Tự động load ảnh từ thư mục images/
 * Đọc danh sách ảnh từ images-list.json và load tất cả vào scene
 */
async function loadImagesFromDirectory() {
    try {
        // Thử load từ images-list.json
        const response = await fetch('images/images-list.json');
        if (!response.ok) {
            console.log('⚠️ Không tìm thấy images-list.json. Chạy: node generate-images-list.js');
            return;
        }
        
        const data = await response.json();
        if (!data.images || data.images.length === 0) {
            console.log('⚠️ Không có ảnh nào trong images-list.json');
            return;
        }
        
        console.log(`📸 Đang load ${data.images.length} ảnh từ thư mục images/...`);
        
        // Load từng ảnh
        const textureLoader = new THREE.TextureLoader();
        let loadedCount = 0;
        
        data.images.forEach((imageFile, index) => {
            const imagePath = `images/${imageFile}`;
            
            textureLoader.load(
                imagePath,
                (texture) => {
                    texture.colorSpace = THREE.SRGBColorSpace;
                    addPhotoToScene(texture);
                    loadedCount++;
                    if (loadedCount === data.images.length) {
                        console.log(`✅ Đã load thành công ${loadedCount} ảnh!`);
                    }
                },
                undefined,
                (error) => {
                    console.warn(`⚠️ Không thể load ảnh: ${imageFile}`, error);
                }
            );
        });
        
    } catch (error) {
        // Lỗi CORS khi mở file trực tiếp (file://) - cần chạy qua local server
        console.warn('⚠️ Không thể load ảnh tự động. Vui lòng chạy qua local server (ví dụ: python -m http.server)');
        console.warn('Chi tiết lỗi:', error.message);
    }
}

/**
 * Xử lý sự kiện upload ảnh
 * Đọc file ảnh và thêm vào scene như một particle
 * @param {Event} e - Event từ input file
 */
function handleImageUpload(e) {
    const files = e.target.files;
    if(!files.length) return;
    Array.from(files).forEach(f => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            new THREE.TextureLoader().load(ev.target.result, (t) => {
                t.colorSpace = THREE.SRGBColorSpace;
                addPhotoToScene(t);
            });
        }
        reader.readAsDataURL(f);
    });
}

// --- XỬ LÝ CỬ CHỈ TAY (MEDIAPIPE) ---

/**
 * Khởi tạo MediaPipe để nhận diện cử chỉ tay
 * Thiết lập webcam và hand landmarker để theo dõi tay người dùng
 */
async function initMediaPipe() {
    video = document.getElementById('webcam');
    webcamCanvas = document.getElementById('webcam-preview');
    webcamCtx = webcamCanvas.getContext('2d');
    webcamCanvas.width = 160; webcamCanvas.height = 120;

    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1
    });
    
    if (navigator.mediaDevices?.getUserMedia) {
        // Tối ưu: Giảm độ phân giải webcam để tiết kiệm tài nguyên
        // MediaPipe không cần độ phân giải cao để nhận diện tay
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 320 },
                height: { ideal: 240 },
                frameRate: { ideal: 30 }
            } 
        });
        video.srcObject = stream;
        video.addEventListener("loadeddata", predictWebcam);
    }
}

let lastVideoTime = -1;

/**
 * Dự đoán cử chỉ tay từ webcam mỗi frame
 * Gọi MediaPipe để nhận diện tay và xử lý cử chỉ
 */
async function predictWebcam() {
    if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        if (handLandmarker) {
            const result = handLandmarker.detectForVideo(video, performance.now());
            processGestures(result);
        }
    }
    requestAnimationFrame(predictWebcam);
}

/**
 * Kiểm tra xem một ngón tay có duỗi ra hay không
 * @param {Object} lm - Landmarks array
 * @param {number} mcpIndex - Index của MCP joint (khớp gốc ngón)
 * @param {number} pipIndex - Index của PIP joint (khớp giữa ngón)
 * @param {number} tipIndex - Index của tip (đầu ngón)
 * @returns {boolean} - true nếu ngón duỗi ra
 */
function isFingerExtended(lm, mcpIndex, pipIndex, tipIndex) {
    const mcp = lm[mcpIndex];
    const pip = lm[pipIndex];
    const tip = lm[tipIndex];
    // Kiểm tra cả 2 đoạn: MCP->PIP và PIP->tip
    const dist1 = Math.hypot(pip.x - mcp.x, pip.y - mcp.y);
    const dist2 = Math.hypot(tip.x - pip.x, tip.y - pip.y);
    // Ngón duỗi ra nếu cả 2 đoạn đều dài
    return dist1 > 0.08 && dist2 > 0.08;
}

/**
 * Đếm số ngón tay đang duỗi ra (không tính ngón cái)
 * @param {Object} lm - Landmarks array
 * @returns {number} - Số ngón duỗi ra (0-4)
 */
function countExtendedFingers(lm) {
    let count = 0;
    // Index finger: MCP=5, PIP=6, tip=8
    if (isFingerExtended(lm, 5, 6, 8)) count++;
    // Middle finger: MCP=9, PIP=10, tip=12
    if (isFingerExtended(lm, 9, 10, 12)) count++;
    // Ring finger: MCP=13, PIP=14, tip=16
    if (isFingerExtended(lm, 13, 14, 16)) count++;
    // Pinky finger: MCP=17, PIP=18, tip=20
    if (isFingerExtended(lm, 17, 18, 20)) count++;
    return count;
}

/**
 * Kiểm tra cử chỉ véo (pinch) - ngón cái và ngón trỏ gần nhau, các ngón khác vẫn mở
 * @param {Object} lm - Landmarks array
 * @returns {boolean} - true nếu là cử chỉ véo
 */
function isPinchGesture(lm) {
    const thumbTip = lm[4]; // Thumb tip
    const indexTip = lm[8]; // Index tip
    
    // Khoảng cách giữa đầu ngón cái và đầu ngón trỏ phải gần (véo)
    const thumbToIndexDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    
    // Các ngón khác PHẢI mở (duỗi ra) - khác với OK sign
    const middleExtended = isFingerExtended(lm, 9, 10, 12);
    const ringExtended = isFingerExtended(lm, 13, 14, 16);
    const pinkyExtended = isFingerExtended(lm, 17, 18, 20);
    
    // Pinch: ngón cái và ngón trỏ gần nhau (< 0.05), các ngón khác VẪN MỞ
    return thumbToIndexDist < 0.05 && middleExtended && ringExtended && pinkyExtended;
}

/**
 * Phát âm thanh khi thay đổi chế độ
 * @param {string} mode - Chế độ mới
 */
function playModeChangeSound(mode) {
    // Tạo âm thanh đơn giản bằng Web Audio API
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Tần số khác nhau cho mỗi chế độ
        const frequencies = {
            'TREE': 440,      // A4
            'SCATTER': 523,   // C5
            'FOCUS': 659      // E5
        };
        
        oscillator.frequency.value = frequencies[mode] || 440;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
        console.log('Không thể phát âm thanh:', error);
    }
}

/**
 * Xử lý cử chỉ tay để thay đổi chế độ hiển thị
 * - Véo (ngón cái + ngón trỏ gần nhau, các ngón khác mở): Chuyển sang chế độ FOCUS (phóng to 1 ảnh)
 * - Nắm tay (0 ngón duỗi): Chuyển sang chế độ TREE (cây thông)
 * - Mở tay (4 ngón duỗi): Chuyển sang chế độ SCATTER (rải rác)
 * @param {Object} result - Kết quả nhận diện từ MediaPipe
 */
function processGestures(result) {
    if (result.landmarks && result.landmarks.length > 0) {
        STATE.hand.detected = true;
        const lm = result.landmarks[0];
        STATE.hand.x = (lm[9].x - 0.5) * 2; 
        STATE.hand.y = (lm[9].y - 0.5) * 2;

        // Kiểm tra cử chỉ véo (ngón cái và ngón trỏ gần nhau, các ngón khác mở)
        const isPinch = isPinchGesture(lm);
        
        // Đếm số ngón duỗi ra để phân biệt nắm tay và mở tay
        const extendedFingers = countExtendedFingers(lm);

        // Debouncing cho cử chỉ véo để tránh chuyển đổi quá nhanh
        if (isPinch) {
            STATE.gestureState.pinchFrames++;
            // Chỉ chuyển sang FOCUS mode sau khi cử chỉ được xác nhận trong nhiều frame liên tiếp
            if (STATE.gestureState.pinchFrames >= STATE.gestureState.requiredFrames) {
                if (STATE.mode !== 'FOCUS') {
                    STATE.mode = 'FOCUS';
                    const photos = particleSystem.filter(p => p.type === 'PHOTO');
                    if (photos.length) STATE.focusTarget = photos[Math.floor(Math.random()*photos.length)].mesh;
                    playModeChangeSound('FOCUS');
                    STATE.gestureState.lastMode = 'FOCUS';
                }
            }
        } else {
            // Reset counter nếu không phải cử chỉ véo
            STATE.gestureState.pinchFrames = 0;
            
            // Phân biệt nắm tay và mở tay dựa trên số ngón duỗi ra
            let newMode = null;
            if (extendedFingers === 0) {
                // Nắm tay - TREE mode (0 ngón duỗi)
                newMode = 'TREE';
                STATE.focusTarget = null;
            } else if (extendedFingers >= 4) {
                // Mở tay - SCATTER mode (4 ngón duỗi)
                newMode = 'SCATTER';
                STATE.focusTarget = null;
            }
            // Chỉ thay đổi nếu mode thực sự thay đổi
            if (newMode && newMode !== STATE.mode) {
                STATE.mode = newMode;
                playModeChangeSound(newMode);
                STATE.gestureState.lastMode = newMode;
            }
        }
    } else {
        STATE.hand.detected = false;
        STATE.gestureState.pinchFrames = 0; // Reset khi không phát hiện tay
    }
}

/**
 * Thiết lập các sự kiện: resize window, upload ảnh, phím tắt
 * Xử lý resize để điều chỉnh camera và renderer
 * Xử lý phím 'H' để ẩn/hiện UI controls
 */
function setupEvents() {
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    });
    document.getElementById('file-input').addEventListener('change', handleImageUpload);
    
    // Xử lý input lời chúc
    const greetingInput = document.getElementById('greeting-input');
    const updateGreetingBtn = document.getElementById('update-greeting-btn');
    const greetingText = document.getElementById('greeting-text');
    
    updateGreetingBtn.addEventListener('click', () => {
        const text = greetingInput.value.trim() || 'Merry Christmas';
        greetingText.textContent = text;
        greetingInput.value = '';
    });
    
    greetingInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            updateGreetingBtn.click();
        }
    });
    
    // Xử lý chụp ảnh màn hình
    const screenshotBtn = document.getElementById('screenshot-btn');
    screenshotBtn.addEventListener('click', takeScreenshot);
    
    // Toggle Photo Wall mode (phím P)
    // Toggle Bloom effect (phím B)
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'p') {
            STATE.photoWallMode = !STATE.photoWallMode;
            if (STATE.photoWallMode) {
                updatePhotoWallLayout();
                STATE.mode = 'SCATTER'; // Chuyển sang scatter để hiển thị Photo Wall
            }
        }
        if (e.key.toLowerCase() === 'b') {
            if (bloomPass) {
                bloomPass.enabled = !bloomPass.enabled;
                console.log('Bloom effect:', bloomPass.enabled ? 'ON' : 'OFF');
            }
        }
    });
    
    // Toggle UI logic - Show/hide controls with Ctrl + h
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'h') {
            e.preventDefault(); // Prevent browser default behavior
            const controls = document.querySelectorAll('.upload-wrapper');
            controls.forEach(ctrl => {
                ctrl.classList.toggle('ui-visible');
            });
        }
    });
}

/**
 * Chụp ảnh màn hình của canvas và tải xuống
 */
function takeScreenshot() {
    renderer.render(scene, camera);
    renderer.domElement.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `noel-tree-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 'image/png');
}

/**
 * Thiết lập âm thanh nền
 * Phát nhạc nền từ file MP3, tự động loop khi hết
 */
function setupAudio() {
    // Tạo audio listener tại vị trí camera
    audioListener = new THREE.AudioListener();
    camera.add(audioListener);
    
    // Tên file nhạc - thay đổi tên file tại đây nếu file của bạn có tên khác
    const musicFile = 'background.mp3'; // Có thể thay đổi thành tên file MP3 của bạn
    
    // Tạo background music
    backgroundMusic = new THREE.Audio(audioListener);
    const audioLoader = new THREE.AudioLoader();
    
    audioLoader.load(
        musicFile,
        (buffer) => {
            backgroundMusic.setBuffer(buffer);
            backgroundMusic.setLoop(true); // Lặp lại khi hết
            backgroundMusic.setVolume(0.5); // Điều chỉnh volume (0.0 - 1.0)
            
            // Tự động phát nhạc khi load xong
            backgroundMusic.play().catch(error => {
                console.log('Lưu ý: Một số trình duyệt yêu cầu tương tác người dùng trước khi phát nhạc:', error);
                console.log('Vui lòng click vào trang web để phát nhạc.');
            });
            console.log('✅ Nhạc nền đã được load và phát');
        },
        undefined,
        (error) => {
            console.warn('⚠️ Không tìm thấy file nhạc:', musicFile);
            console.warn('Vui lòng đảm bảo file MP3 có tên "background.mp3" trong thư mục hoặc thay đổi tên file trong code.');
            console.warn('Chi tiết lỗi:', error);
        }
    );
}

/**
 * Vòng lặp animation chính
 * Cập nhật xoay của scene dựa trên cử chỉ tay hoặc tự động
 * Cập nhật tất cả particles và render scene
 */
function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();

    // Rotation Logic
    if (STATE.mode === 'SCATTER' && STATE.hand.detected) {
        const targetRotY = STATE.hand.x * Math.PI * 0.9; 
        const targetRotX = STATE.hand.y * Math.PI * 0.25;
        STATE.rotation.y += (targetRotY - STATE.rotation.y) * 3.0 * dt;
        STATE.rotation.x += (targetRotX - STATE.rotation.x) * 3.0 * dt;
    } else {
        if(STATE.mode === 'TREE') {
            STATE.rotation.y += 0.3 * dt;
            STATE.rotation.x += (0 - STATE.rotation.x) * 2.0 * dt;
        } else {
             STATE.rotation.y += 0.1 * dt; 
        }
    }

    mainGroup.rotation.y = STATE.rotation.y;
    mainGroup.rotation.x = STATE.rotation.x;

    // Cập nhật tuyết rơi
    updateSnowfall(dt);

    particleSystem.forEach(p => p.update(dt, STATE.mode, STATE.focusTarget));
    composer.render();
}

/**
 * Cập nhật vị trí các hạt tuyết để tạo hiệu ứng rơi
 * @param {number} dt - Delta time
 */
function updateSnowfall(dt) {
    if (!snowSystem) return;
    
    const positions = snowSystem.geometry.attributes.position.array;
    
    for (let i = 0; i < CONFIG.snow.count; i++) {
        const i3 = i * 3;
        
        // Cập nhật vị trí dựa trên vận tốc
        positions[i3] += snowVelocities[i * 3] * dt * 60; // x
        positions[i3 + 1] += snowVelocities[i * 3 + 1] * dt * 60; // y
        positions[i3 + 2] += snowVelocities[i * 3 + 2] * dt * 60; // z
        
        // Reset hạt tuyết khi rơi quá thấp
        if (positions[i3 + 1] < -50) {
            positions[i3] = (Math.random() - 0.5) * 200;
            positions[i3 + 1] = 250;
            positions[i3 + 2] = (Math.random() - 0.5) * 200;
        }
        
        // Giới hạn x và z để tuyết không bay quá xa
        if (Math.abs(positions[i3]) > 150) {
            positions[i3] = (Math.random() - 0.5) * 200;
        }
        if (Math.abs(positions[i3 + 2]) > 150) {
            positions[i3 + 2] = (Math.random() - 0.5) * 200;
        }
    }
    
    snowSystem.geometry.attributes.position.needsUpdate = true;
}

// Khởi chạy ứng dụng
init();

