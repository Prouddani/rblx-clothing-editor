import * as THREE from 'three';
import { DecalGeometry } from '/jsm/geometries/DecalGeometry.js';

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
    BACK: sum_array([217, 76, 281, 204], [-132, 0, -132, 0]),
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

    Export(face, torso=THREE.Mesh, decals=[]) {
        const exportScene = new THREE.Scene();
        const frontCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
        frontCamera.position.set(0, 0, 1);
        frontCamera.lookAt(0, 0, 0);

        // // Extract only front face geometry from the object
        // const faceMesh = new THREE.Mesh(
        //     this.extractFaceGeometry(torso.geometry.clone(), face),
        //     new THREE.MeshBasicMaterial({
        //         map: torso.material.map || null,
        //         color: torso.material.color || new THREE.Color(1, 1, 1)
        //     })
        // );
        // faceMesh.rotation.copy(torso.rotation);
        // faceMesh.position.copy(torso.position);
        // exportScene.add(faceMesh);

        // Add decals that are projected on front face
        decals.forEach((decal) => {
            if (decal.userData.face === face) {
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
            }
        });


        // Render only that part of the face
        this.renderer.setRenderTarget(this.renderTarget);
        this.renderer.render(exportScene, frontCamera);
        this.renderer.setRenderTarget(null);
        this.renderer.render( // Display to the #export-canvas element
            new THREE.Scene().add(new THREE.Mesh(
                new THREE.PlaneGeometry(2, 2),
                new THREE.MeshBasicMaterial({ map: this.renderTarget.texture })
            )),
            new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
        );

        // Texture gets converted to pixels
        const pixels = new Uint8Array(this.templateSettings.width * this.templateSettings.height * 4);
        this.renderer.readRenderTargetPixels(this.renderTarget, 0, 0, this.templateSettings.width, this.templateSettings.height, pixels);
        this.flipImageDataY(pixels, this.templateSettings.width, this.templateSettings.height);

        // Texture gets transformed to a .png
        const canvas = document.createElement('canvas');
        canvas.width = this.templateSettings.width;
        canvas.height = this.templateSettings.height;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(this.templateSettings.width, this.templateSettings.height);
        
        this.linearToSRGB(pixels); // Convers Linear to sRGB, so the image isn't darken up
        imageData.data.set(pixels);
        ctx.putImageData(imageData, 0, 0);

        // Download & Export
        const link = document.createElement('a');
        link.download = 'front_face_texture.png';
        link.href = canvas.toDataURL();
        link.click();
    }
}

export { RigExporter };