import * as THREE from 'three';

const sum_array = (a, b) => {
    return a.map((val, i) => val + b[i]);
}
const sub_array = (a, b) => {
    return a.map((val, i) => val - b[i]);
}
const mul_array = (a, b) => {
    return a.map((val, i) => val * b[i]);
}
const div_array = (a, b) => {
    return a.map((val, i) => val / b[i]);
}

const mapping = {};
mapping['torso'] = {
    FRONT: [231, 357, 359, 485],
    BACK: [427, 357, 555, 485],
    LEFT: [361, 357, 425, 485],
    RIGHT: [165, 357, 229, 485],
    UP: [231, 487, 359, 551],
    DOWN: [231, 290, 359, 355]
};
mapping['bottom-left'] = {
    FRONT: [217, 76, 281, 204],
    BACK: [85, 76, 149, 204],
    UP: [217, 206, 281, 270],
    DOWN: sum_array([217, 206, 281, 270], [0, -196, 0, -196]),
    LEFT: sum_array([85, 76, 149, 204], [-66, 0, -66, 0]),
    RIGHT: sum_array([217, 76, 281, 204], [-66, 0, -66, 0])
};
mapping['bottom-right'] = {
    FRONT: [308, 76, 372, 204],
    BACK: [440, 76, 504, 204],
    UP: [308, 206, 372, 270],
    DOWN: sum_array([308, 206, 372, 270], [0, -196, 0, -196]),
    LEFT: sum_array([308, 76, 372, 204], [66, 0, 66, 0]),
    RIGHT: sum_array([440, 76, 504, 204], [66, 0, 66, 0])
};

class RigExporter {
    constructor(renderer, templateSettings = {}) {
        this.templateSettings = templateSettings;
        this.renderer = renderer;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.setClearColor(0x000000, 0); // Black + fully transparent
        this.renderer.toneMapping = THREE.NoToneMapping;

        // Width x Height: 512x512
        this.renderTarget = new THREE.WebGLRenderTarget(this.templateSettings.width, this.templateSettings.height, {
            format: THREE.RGBAFormat,
            encoding: THREE.sRGBEncoding,
            type: THREE.UnsignedByteType,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
        });
        this.renderTarget.texture.encoding = THREE.sRGBEncoding;

        this.extractFaceGeometry = (geometry, face) => {
            // Extract UV texture of the face

            const faceIndex = {
                right: 0,
                left: 1,
                top: 2,
                bottom: 3,
                front: 4,
                back: 5,
            }[face];

            const indexOffset = faceIndex * 6;
            const position = geometry.attributes.position;
            const uv = geometry.attributes.uv;

            const faceGeometry = new THREE.BufferGeometry();
            const positions = [];
            const uvs = [];

            for (let i = 0; i < 6; i++) {
                const idx = indexOffset + i;
                const posIdx = idx * 3;
                const uvIdx = idx * 2;

                positions.push(
                    position.array[posIdx],
                    position.array[posIdx + 1],
                    position.array[posIdx + 2]
                );

                uvs.push(
                    uv.array[uvIdx],
                    uv.array[uvIdx + 1]
                );
            }

            faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            faceGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            return faceGeometry;
        }

        // Flip pixels vertically (optional, if image is upside-down)
        this.flipImageDataY = (data, width, height) => {
            const bytesPerRow = width * 4;
            const temp = new Uint8Array(bytesPerRow);
            for (let y = 0; y < Math.floor(height / 2); y++) {
                const top = y * bytesPerRow;
                const bottom = (height - y - 1) * bytesPerRow;
                temp.set(data.slice(top, top + bytesPerRow));
                data.set(data.slice(bottom, bottom + bytesPerRow), top);
                data.set(temp, bottom);
            }
        }

        this.linearToSRGB = (pixelBuffer) => {
            const saturationBoost = 1.15; // Try values like 1.05 to 1.3 for subtle to strong

            for (let i = 0; i < pixelBuffer.length; i += 4) {
                const alpha = pixelBuffer[i + 3];
                if (alpha === 0) continue;

                let rgb = [];
                for (let c = 0; c < 3; c++) {
                    let linear = pixelBuffer[i + c] / 255;
                    let srgb = linear <= 0.0031308
                        ? linear * 12.92
                        : 1.055 * Math.pow(linear, 1.0 / 2.4) - 0.055;
                    rgb.push(srgb);
                }

                // Boost saturation
                const avg = (rgb[0] + rgb[1] + rgb[2]) / 3;
                for (let c = 0; c < 3; c++) {
                    let boosted = avg + (rgb[c] - avg) * saturationBoost;
                    pixelBuffer[i + c] = Math.min(255, Math.max(0, Math.round(boosted * 255)));
                }
            }
        };
    }

    Export(torso=THREE.Mesh, decals=[]) {
        const exportScene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);

        const canvas = document.createElement('canvas'); // Temporary
        canvas.width = this.templateSettings.width;
        canvas.height = this.templateSettings.height;
        const ctx = canvas.getContext('2d');

        const canvas2 = document.createElement('canvas');
        canvas2.width = this.templateSettings.width;
        canvas2.height = this.templateSettings.height;
        const ctx2 = canvas2.getContext('2d');

        // Torso
        ['FRONT', 'BACK', 'LEFT', 'RIGHT', 'UP', 'DOWN'].forEach(face => {
            /*
             * How it works:
             * - On each face, we get it's texture (with DecalGeometries), put it in a temp canvas (canvas).
             * - Then, we copy what is drawn in the canvas and put it in a specific place inside canvas2, by the context (ctx2)
             * - After doing for all sides, we simply export and the user downloads the torso
            */

            
            exportScene.clear()
            ctx.clearRect(0, 0, 585, 559) // Clears the temporary context

            const cameraPosition = {
                FRONT: new THREE.Vector3(0, 0, 1),
                BACK: new THREE.Vector3(0, 0, -1),
                LEFT: new THREE.Vector3(1, 0, 0),
                RIGHT: new THREE.Vector3(-1, 0, 0),
                UP: new THREE.Vector3(0, 1, 0),
                DOWN: new THREE.Vector3(0, -1, 0)
            }[face];

            camera.position.copy(cameraPosition);
            camera.lookAt(new THREE.Vector3(0, 0, 0));
            camera.updateMatrixWorld();

            // Add torso, so the decals can be projected
            const torsoclone = torso.clone();
            console.log("Torso world position:", torsoclone.getWorldPosition(new THREE.Vector3()));
            torsoclone.material = new THREE.MeshBasicMaterial({
                // colorWrite: false,
                color: 0xffffff,
                depthWrite: true,
                depthTest: true,
            });
            torsoclone.position.set(new THREE.Vector3(0, 0, 0));
            exportScene.add(torsoclone);
            
            // Add decals that are projected on the object
            for (const decal of decals) {
                if (decal.userData.face != face)
                    continue;

                const dc = decal.clone();
                dc.material = new THREE.MeshBasicMaterial({
                    map: decal.material.map,
                    color: decal.material.color,
                    transparent: decal.material.transparent,
                    depthWrite: decal.material.depthWrite,
                    depthTest: decal.material.depthTest,
                    polygonOffset: decal.material.polygonOffset,
                    polygonOffsetFactor: decal.material.polygonOffsetFactor, // Push it far forward
                    alphaTest: decal.material.alphaTest,
                    blending: THREE.NormalBlending
                });

                exportScene.add(dc);
            };

            // Render
            this.renderer.setRenderTarget(this.renderTarget);
            this.renderer.render(exportScene, camera);

            this.renderer.setRenderTarget(null);

            // Display to the #export-canvas element
            this.renderer.render(
                new THREE.Scene().add(new THREE.Mesh(
                    new THREE.PlaneGeometry(2, 2),
                    new THREE.MeshBasicMaterial({
                        map: this.renderTarget.texture,
                    })
                )),
                new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
            );

            // Texture gets converted to pixels
            const pixels = new Uint8Array(this.templateSettings.width * this.templateSettings.height * 4);
            this.renderer.readRenderTargetPixels(this.renderTarget, 0, 0, this.templateSettings.width, this.templateSettings.height, pixels);
            this.flipImageDataY(pixels, this.templateSettings.width, this.templateSettings.height);
            this.linearToSRGB(pixels); // Convers Linear to sRGB, so the image isn't darken up
            
            // Convert to canvas
            const imageData = ctx.createImageData(this.templateSettings.width, this.templateSettings.height);
            imageData.data.set(pixels);
            ctx.putImageData(imageData, 0, 0);

            // Place on final canvas
            const [x0, y0, x1, y1] = mapping['torso'][face];
            const w = x1 - x0;
            const h = y1 - y0;

            ctx2.drawImage(
                canvas,        // source canvas
                0, 0, canvas.width, canvas.height, // Crop image
                x0, canvas2.height - y1, w, h // Destination
            );
        });

        // Download & Export
        const link = document.createElement('a');
        link.download = 'front_face_texture.png';
        link.href = canvas2.toDataURL();
        link.click();
    }
}

export { RigExporter };