import * as three from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { DecalGeometry } from '/rblx-clothing-editor/jsm/geometries/DecalGeometry.js';;
import { RigExporter } from '/rblx-clothing-editor/editor/js/export.js';

// Variables & Constants
let lastPaint = {
    instance: null,
    position: null,
    timestamp: null,
};
let paintAmount = 0;
const brushShapes = {
    CIRCULAR: new three.TextureLoader().load('/rblx-clothing-editor/public/paint.png'),
}
brushShapes.CIRCULAR.premultiplyAlpha = true;
brushShapes.CIRCULAR.colorSpace = three.SRGBColorSpace;
brushShapes.CIRCULAR.encoding = three.sRGBEncoding;

const brushSizeLabel = $('#brush-size-label');
const brushSize = $('#brush-size');

const characterColorPicker = $('#ccolorpicker');
const paintColor = new iro.ColorPicker('#paint-colorwheel', {
    width: 150,
    color: '#faa',
    margin: 1,
});


const brushTool = $('#brush-tool');
if (brushTool.attr('active') !== undefined) {
    brushTool.css('background-color', 'rgb(180, 180, 180)');
}

const bucketTool = $('#bucket-tool');
if (bucketTool.attr('active') !== undefined) {
    bucketTool.css('background-color', 'rgb(180, 180, 180)');
}

brushTool.on('click', function() {
    const isActive = $(this).attr('active') !== undefined;

    if (isActive) {
        $(this).removeAttr('active').css('background-color', 'rgb(240, 240, 240)');
    } else {
        $(this).attr('active', 'true').css('background-color', 'rgb(180, 180, 180)');
        bucketTool.removeAttr('active').css('background-color', 'rgb(240, 240, 240')
    }
});

bucketTool.on('click', function() {
    const isActive = $(this).attr('active') !== undefined;

    if (isActive) {
        $(this).removeAttr('active').css('background-color', 'rgb(240, 240, 240)');
    } else {
        $(this).attr('active', 'true').css('background-color', 'rgb(180, 180, 180)');
        brushTool.removeAttr('active').css('background-color', 'rgb(240, 240, 240')
    }
});


// Export Varibles & Constants
const exportRenderer = new three.WebGLRenderer({
    antialias: false,
    canvas: $('#export-canvas')[0],
})
exportRenderer.setSize(585, 559);
exportRenderer.outputEncoding = three.sRGBEncoding;

const exporter = new RigExporter(exportRenderer, {
    width: 585,
    height: 559,
});


// Essentials
const renderer = new three.WebGLRenderer({
    canvas: $('#renderer')[0],
    alpha: true
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(600, 600);
renderer.toneMapping = three.NoToneMapping;

const scene = new three.Scene();
const camera = new three.PerspectiveCamera(
    75,
    renderer.domElement.width / renderer.domElement.height,
    0.1,
    1000
);
camera.position.z = 5;

function renderLoop() {
    requestAnimationFrame(renderLoop);
    orbitcontrol.update();
    renderer.render(scene, camera);
}

{ // Lighting
    const hemispherelight = new three.HemisphereLight(0xffffff, 0x080830, 3.43);
    scene.add(hemispherelight);

    const ambientlight = new three.AmbientLight(
        new three.Color().setRGB(70, 70, 70),
        0.02
    );
    scene.add(ambientlight);
}

let orbitcontrol;
{ // Orbit Controls
    orbitcontrol = new OrbitControls(camera, renderer.domElement);
    orbitcontrol.mouseButtons = {
        RIGHT: three.MOUSE.ROTATE,
        MIDDLE: three.MOUSE.DOLLY
    };
}

let mouseStates = {
    leftbutton: false,
    rightbutton: false,
    middlebutton: false
}
{ // Canvas Controls
    renderer.domElement.addEventListener('mousedown', (e) => {
        switch (e.button) {
            case 0:
                mouseStates.leftbutton = true;
                break;
            case 1:
                mouseStates.rightbutton = true;
                break;
            case 2:
                mouseStates.middlebutton = true;
                break;
            default:
                break;
        }
    });
    renderer.domElement.addEventListener('mouseup', (e) => {
        switch (e.button) {
            case 0:
                mouseStates.leftbutton = false;
                break;
            case 1:
                mouseStates.rightbutton = false;
                break;
            case 2:
                mouseStates.middlebutton = false;
                break;
            default:
                break;
        }
    });
}


// Rig
let paint_locations = {
    'head': [], // Always empty
    'torso': [],
    'rightArm': [],
    'leftArm': [],
    'rightLeg': [],
    'leftLeg': []
}

const objLoader = new OBJLoader();

async function loadObjFile(path, name) {
    const obj = await objLoader.loadAsync(path)
    obj.name = name;

    return obj;
}

async function initCharacter() {
    const makeBox = (w, h, d, name) => {
        const geometry = new three.BoxGeometry(w, h, d).toNonIndexed();
        geometry.computeBoundingBox();
        geometry.center(); // Crucial

        const mesh = new three.Mesh(
            geometry,
            new three.MeshBasicMaterial({
                depthWrite: true,
                depthTest: true,
            })
        );
        mesh.name = name;
        mesh.renderOrder = Math.Infinity;
        return mesh;
    };

    const [ head, torso, rightArm, leftArm, rightLeg, leftLeg ] = await Promise.all([
        loadObjFile( '/rblx-clothing-editor/public/resources/head/Head.obj', 'head' ),
        Promise.resolve(makeBox(2, 2, 1, 'torso' )),
        Promise.resolve(makeBox(1, 2, 1, 'rightArm')),
        Promise.resolve(makeBox(1, 2, 1, 'leftArm')),
        Promise.resolve(makeBox(1, 2, 1, 'rightLeg')),
        Promise.resolve(makeBox(1, 2, 1, 'leftLeg')),
    ]);

    { // Face
        const faceTex = await new three.TextureLoader().loadAsync('/rblx-clothing-editor/public/resources/head/face.png');
        faceTex.colorSpace = three.SRGBColorSpace;
        const face = new three.Mesh(
            new three.PlaneGeometry(1, 1),
            new three.MeshBasicMaterial(
                {
                    map: faceTex,
                    transparent: true,
                    depthWrite: false,
                    depthTest: true,
                }
            )
        );
        face.position.set(0, 0, 0.61);
        face.name = 'face';
        face.raycast = () => {};
        face.renderOrder = 99999999;

        head.add(face);
    }

    // Change color of a object
    const dye = (obj, color = three.Color) => {
        if (obj.name === 'face')
            return;

        const newMaterial = new three.MeshBasicMaterial({color: color});
        obj.traverse((mesh) => {
            if (mesh.isMesh && !(mesh.name === 'face' || mesh.name === 'paint')) {
                mesh.material = newMaterial.clone();
            }
        });
    };

    const limbs = [
        { target: torso, name: 'torso', position: new three.Vector3(0, 0, 0), },
        { target: rightArm, name: 'rightArm', position: new three.Vector3(-1.5, 0, 0), },
        { target: leftArm, name: 'leftArm', position: new three.Vector3(1.5, 0, 0), },
        { target: rightLeg, name: 'rightLeg', position: new three.Vector3(-0.5, -2, 0), },
        { target: leftLeg, name: 'leftLeg', position: new three.Vector3(0.5, -2, 0), },
        { target: head, name: 'head', position: new three.Vector3(0, 1.5, 0), }
    ];

    // Setting up the limbs and positioning them
    limbs.forEach(({ target, name, position }) => {
        dye(target, characterColorPicker.val());
        characterColorPicker.on('input', function() {
            dye(target, $(this).val())
        });

        target.position.copy(position)

        target.traverse((mesh) => {
            if (mesh.isMesh) {
                const line = new three.LineSegments(
                    new three.EdgesGeometry(mesh.geometry),
                    new three.LineBasicMaterial({ color: new three.Color().setRGB(0, 0, 0) })
                );
                line.raycast = () => {};
                line.renderOrder = -Math.Infinity;
                target.add(line);
            }
        });
        scene.add(target);
    });

    return { head, torso, rightArm, leftArm, rightLeg, leftLeg };
}

const draw = (hit = {}) => {
    if (hit.instance === null)
        return;

    if (!(hit.instance.isMesh && hit.instance.geometry)) return;
    if (hit.instance.parent?.name === 'paint') return;

    const snapped = hit.snappedNormal()
    if (!snapped) return;

    let decalSize;
    { // Decal Size
        const s = brushSize.val(); // Base scale
        const depth = 1; // Decal's depth (scale)
        if (Math.abs(snapped.z) === 1)
            decalSize = new three.Vector3(s, s, s * depth); // When facing Z axis
        else if (Math.abs(snapped.x) === 1)
            decalSize = new three.Vector3(s * depth, s, s); // When facing X axis
        else if (Math.abs(snapped.y) === 1)
            decalSize = new three.Vector3(s, s * depth, s); // When facing Y axis
    }

    // Making the paint mesh (Decal)
    const paint = new three.Mesh(
        new DecalGeometry(
            hit.instance, // The object to project on
            hit.position.clone(), // The position to project at
            hit.normal.clone(), // The direction of the projection
            decalSize // The size of the projection (width, height, depth)
        ),
        new three.MeshBasicMaterial({
            map: brushShapes.CIRCULAR,
            color: new three.Color(paintColor.color.hexString),
            transparent: true,
            depthWrite: false,
            depthTest: true,
            polygonOffset: true,
            polygonOffsetFactor: -0.05, // Push it far forward
            alphaTest: 0.993,
        })
    );
    paintAmount += 1;
    
    paint.name = 'paint';
    paint.raycast = () => {}; // Ignores Raycasts
    paint.renderOrder = paintAmount
    paint.userData.face = hit.getNormalFace(hit.snappedNormal());
    paint.rotation = hit.getDecalOrientation(hit.snappedNormal());
    
    paint.material.map.encoding = three.sRGBEncoding;
    paint.material.map.colorSpace = three.SRGBColorSpace;

    scene.add(paint);

    paint_locations[hit.instance.name].push(paint);
}

// Essential Tools (Brush, Bucket, etc.)
const handleTools = (event, selectedTool) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new three.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const limbs = ['torso', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'];
    let whitelist = limbs.map(name => scene.getObjectByName(name)).filter(obj => obj && obj.visible);

    const raycaster = new three.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersection = raycaster.intersectObjects(
        whitelist,
        true
    );

    if (intersection.length > 0) {
        const target = intersection[0];
        const hit = {
            instance: (target) ? target.object.isMesh ? target.object : target.object.parent : null,
            position: (target) ? target.point : null,
            normal: (target && target.face) ? target.face.normal.clone().transformDirection(target.object.matrixWorld) : null,
            snappedNormal: () => {
                const normal = (target && target.face) ? target.face.normal.clone().transformDirection(target.object.matrixWorld) : null;
                if (!normal) return null; // Guard

                const snap = (v) => {
                    let maxDot = -Infinity;
                    let bestDirection = null;
                    const normalized = v.clone().normalize();

                    const axes = [
                        new three.Vector3(1, 0, 0),  // +X
                        new three.Vector3(-1, 0, 0),  // -X
                        new three.Vector3(0, 1, 0),  // +Y
                        new three.Vector3(0, -1, 0),  // -Y
                        new three.Vector3(0, 0, 1),  // +Z
                        new three.Vector3(0, 0, -1),  // -Z
                    ];
                    for (const dir of axes) {
                        const dot = normalized.dot(dir);
                        if (dot > maxDot) {
                            maxDot = dot;
                            bestDirection = dir.clone(); // clone to avoid mutating the original
                        }
                    }

                    return bestDirection;
                };
                const snapped = snap(normal);
                return snapped;
            },
            getNormalFace: (v) => {
                const map = {
                    '1, 0, 0': 'RIGHT',
                    '-1, 0, 0': 'LEFT',
                    '0, 1, 0': 'UP',
                    '0, -1, 0': 'DOWN',
                    '0, 0, 1': 'FRONT',
                    '0, 0, -1': 'BACK',
                };
                return map[`${v.x}, ${v.y}, ${v.z}`];
            },
            getDecalOrientation: (normal) => {
                const up = new three.Vector3(0, 0, 1); // Default "up" direction for the decal
                const rotation = new three.Quaternion().setFromUnitVectors(up, normal.clone().normalize());
                return new three.Euler().setFromQuaternion(rotation);
            },
        };

        if (brushTool.attr('active') !== undefined) {
            draw(hit);
        }
    }
};

// Bootstrap
(async () => {
    const { head, torso, rightArm, leftArm, rightLeg, leftLeg } = await initCharacter();

    renderer.domElement.addEventListener('mousemove', (e) => {
        if (mouseStates.leftbutton) {
            handleTools(e);
        }
    });

    brushSize.on('input', function(e) {
        brushSizeLabel.text( $(this).val().toString() );
    });

    { // Toggle viewing limbs
        [head, torso, rightArm, leftArm, rightLeg, leftLeg].forEach((limb) => {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes') {
                        limb.visible = mutation.target.getAttribute('viewing') !== null;

                        // Paint particles
                        paint_locations[limb.name].forEach((p) => {
                            p.visible = limb.visible;
                        });
                    }
                });
            });
            observer.observe(
                $('#view-' + limb.name.toLowerCase())[0],
                {
                    attributes: true
                }
            );
        });
    }

    renderLoop();
})();

const exportButton = $('#export-button');
exportButton.on('click', function(e) {
    console.log('Export button clicked!')

    exporter.Export(
        scene.getObjectByName('torso'),
        paint_locations['torso'],
    );
});
