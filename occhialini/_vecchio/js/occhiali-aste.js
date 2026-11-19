// occhiali-aste.js – la sezione sotto il configuratore:
// a sinistra gli occhiali con le aste che si aprono e si chiudono,
// a destra le immagini delle composizioni di colore (fatte "fotografando" il modello 3D)

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// le parti del modello e il punto della cerniera di ogni asta (misure del file, in metri)
const nomiParti = ['struttura', 'aste', 'lenti', 'gomma', 'ferramenta'];
const cernieraDestra = new THREE.Vector3(0.0715, 0.034, 0.0117);
const cernieraSinistra = new THREE.Vector3(-0.0675, 0.034, 0.0117);
const angoloChiuso = THREE.MathUtils.degToRad(85);   // quanto ruota un'asta per chiudersi

// ---------- strumenti comuni ----------

// risaliamo ai "genitori" di un pezzo finché troviamo il nome della sua parte
function trovaParte(pezzo) {
    while (pezzo) {
        if (nomiParti.includes(pezzo.name)) {
            return pezzo.name;
        }
        pezzo = pezzo.parent;
    }
    return null;
}

// una scena con luci, ambiente e pavimento per le ombre (uguale a quella del configuratore)
function creaScena(renderer) {
    const scena = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    scena.add(new THREE.AmbientLight(0xffffff, 0.3));
    const luce = new THREE.DirectionalLight(0xffffff, 1.5);
    luce.position.set(3, 6, 4);
    luce.castShadow = true;
    luce.shadow.mapSize.set(2048, 2048);
    luce.shadow.camera.left = -4;
    luce.shadow.camera.right = 4;
    luce.shadow.camera.top = 4;
    luce.shadow.camera.bottom = -4;
    luce.shadow.radius = 4;
    scena.add(luce);

    const pavimento = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 20),
        new THREE.ShadowMaterial({ opacity: 0.2 })
    );
    pavimento.rotation.x = -Math.PI / 2;
    pavimento.receiveShadow = true;
    scena.add(pavimento);

    return { scena: scena, pavimento: pavimento };
}

// prepara una copia del modello: materiali separati per parte, ombre, centrato e grande come nel configuratore
function preparaModello(originale, pavimento) {
    const modello = originale.clone(true);
    const materialiPerParte = {};

    modello.traverse(function(pezzo) {
        if (pezzo.isMesh) {
            pezzo.castShadow = true;
            pezzo.receiveShadow = true;
            pezzo.material = pezzo.material.clone();
            const nome = trovaParte(pezzo);
            if (nome) {
                if (!materialiPerParte[nome]) {
                    materialiPerParte[nome] = [];
                }
                materialiPerParte[nome].push(pezzo.material);
            }
        }
    });

    const box = new THREE.Box3().setFromObject(modello);
    const dimensioni = box.getSize(new THREE.Vector3());
    const centro = box.getCenter(new THREE.Vector3());
    const s = 2.4 / Math.max(dimensioni.x, dimensioni.y, dimensioni.z);

    // un contenitore che fa da "scala": dentro il modello resta nelle sue misure originali
    const contenitore = new THREE.Group();
    contenitore.scale.setScalar(s);
    modello.position.set(-centro.x, -centro.y, -centro.z);
    contenitore.add(modello);

    pavimento.position.y = -(dimensioni.y * s / 2) - 0.05;

    return { contenitore: contenitore, modello: modello, materialiPerParte: materialiPerParte };
}

// colora le parti: colori è un oggetto come { struttura: '#E3A9A9', aste: '#F2D0CC', ... }
function coloraParti(materialiPerParte, colori) {
    Object.keys(colori).forEach(function(nome) {
        (materialiPerParte[nome] || []).forEach(function(m) {
            m.color.set(colori[nome]);
        });
    });
}

// legge dai pannelli del configuratore i colori selezionati adesso
function coloriScelti() {
    const colori = {};
    document.querySelectorAll('.campioni[data-parti]').forEach(function(gruppo) {
        const scelto = gruppo.querySelector('.campione.selected');
        gruppo.dataset.parti.split(',').forEach(function(nome) {
            colori[nome] = scelto.dataset.color;
        });
    });
    return colori;
}

// i colori di un accostamento: per ogni pannello cerchiamo il campione con quel nome
function coloriAccostamento(bottone) {
    const nomiColori = bottone.dataset.colori.split('|');
    const colori = {};
    document.querySelectorAll('.campioni[data-parti]').forEach(function(gruppo, i) {
        const campione = gruppo.querySelector('.campione[data-nome="' + nomiColori[i] + '"]');
        if (campione) {
            gruppo.dataset.parti.split(',').forEach(function(nome) {
                colori[nome] = campione.dataset.color;
            });
        }
    });
    return colori;
}

// ---------- a sinistra: le aste che si aprono e si chiudono ----------

const visore = document.getElementById('visore-aste');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(visore.clientWidth, visore.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
visore.appendChild(renderer.domElement);

const { scena, pavimento } = creaScena(renderer);

const camera = new THREE.PerspectiveCamera(45, visore.clientWidth / visore.clientHeight, 0.1, 100);
camera.position.set(2.4, 2.2, 2.6);   // da davanti, di lato e dall'alto: così si vedono bene le aste
camera.lookAt(0, 0, 0);

const controlli = new OrbitControls(camera, renderer.domElement);
controlli.enableDamping = true;
controlli.enablePan = false;
controlli.minDistance = 1.5;
controlli.maxDistance = 8;

// i due "perni" su cui girano le aste (null finché il modello non è caricato)
let pernoDestro = null;
let pernoSinistro = null;
let materialiAnimazione = null;

// sposta i pezzi di un'asta dentro un perno messo sulla cerniera: girando il perno, l'asta si apre o si chiude
// la posizione di un pezzo "vista dal modello": mettiamo insieme gli spostamenti
// di tutti i contenitori tra il pezzo e il modello
function matriceNelModello(pezzo, modello) {
    const matrice = new THREE.Matrix4();
    let o = pezzo;
    while (o && o !== modello) {
        o.updateMatrix();
        matrice.premultiply(o.matrix);
        o = o.parent;
    }
    return matrice;
}

// sposta un pezzo dentro il perno senza farlo muovere dal suo posto
function mettiNelPerno(pezzo, perno, modello) {
    const matrice = matriceNelModello(pezzo, modello);
    perno.updateMatrix();
    // la posizione del pezzo "vista dal perno" = (perno al contrario) × (pezzo visto dal modello)
    matrice.premultiply(perno.matrix.clone().invert());
    pezzo.parent.remove(pezzo);
    perno.add(pezzo);
    matrice.decompose(pezzo.position, pezzo.quaternion, pezzo.scale);
}

function creaPerni(modello) {
    const pezziDestri = [];
    const pezziSinistri = [];

    modello.traverse(function(pezzo) {
        if (!pezzo.isMesh) {
            return;
        }
        const nome = trovaParte(pezzo);
        // il centro del pezzo, misurato nelle misure originali del file (come le cerniere)
        pezzo.geometry.computeBoundingBox();
        const centro = pezzo.geometry.boundingBox.getCenter(new THREE.Vector3());
        centro.applyMatrix4(matriceNelModello(pezzo, modello));
        // fanno parte dell'asta: le aste e i terminali in gomma che stanno dietro (z negativo)
        const eAsta = nome === 'aste' || (nome === 'gomma' && centro.z < -0.05);
        if (eAsta) {
            if (centro.x > 0) {
                pezziDestri.push(pezzo);
            } else {
                pezziSinistri.push(pezzo);
            }
        }
    });

    pernoDestro = new THREE.Group();
    pernoDestro.position.copy(cernieraDestra);
    modello.add(pernoDestro);
    pernoSinistro = new THREE.Group();
    pernoSinistro.position.copy(cernieraSinistra);
    modello.add(pernoSinistro);

    pezziDestri.forEach(function(p) { mettiNelPerno(p, pernoDestro, modello); });
    pezziSinistri.forEach(function(p) { mettiNelPerno(p, pernoSinistro, modello); });
}

// quanto è chiusa un'asta (0 = aperta, 1 = chiusa) in un ciclo di 6 secondi:
// 1 s aperta → 1,4 s si chiude → 1,2 s chiusa → 1,4 s si apre → 1 s aperta
function chiusura(secondi) {
    const t = ((secondi % 6) + 6) % 6;
    let valore;
    if (t < 1) valore = 0;
    else if (t < 2.4) valore = (t - 1) / 1.4;
    else if (t < 3.6) valore = 1;
    else if (t < 5) valore = 1 - (t - 3.6) / 1.4;
    else valore = 0;
    return valore * valore * (3 - 2 * valore);   // parte piano e arriva piano
}

const orologio = new THREE.Clock();

renderer.setAnimationLoop(function() {
    if (pernoDestro) {
        const secondi = orologio.getElapsedTime();
        // l'asta sinistra parte un attimo dopo: così si chiudono una sopra l'altra, come quelle vere
        pernoDestro.rotation.y = chiusura(secondi) * angoloChiuso;
        pernoSinistro.rotation.y = -chiusura(secondi - 0.35) * angoloChiuso;
    }
    controlli.update();
    renderer.render(scena, camera);
});

window.addEventListener('resize', function() {
    camera.aspect = visore.clientWidth / visore.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(visore.clientWidth, visore.clientHeight);
});

// quando cambi un colore nel configuratore, anche questi occhiali lo prendono
document.addEventListener('click', function(evento) {
    if (materialiAnimazione && evento.target.closest('.campione, .accostamento')) {
        coloraParti(materialiAnimazione, coloriScelti());
    }
});

// ---------- a destra: le immagini delle composizioni di colore ----------

// un renderer "fotografo" che non si vede: disegna gli occhiali e ne fa un'immagine
function fotografaComposizioni(originale) {
    const larghezza = 800;
    const altezza = 420;
    const fotografo = new THREE.WebGLRenderer({ antialias: true });
    fotografo.setSize(larghezza, altezza);
    fotografo.setClearColor('#f3efe8');   // lo stesso sfondo del visore
    fotografo.shadowMap.enabled = true;
    fotografo.shadowMap.type = THREE.PCFSoftShadowMap;

    const studio = creaScena(fotografo);
    const copia = preparaModello(originale, studio.pavimento);
    studio.scena.add(copia.contenitore);

    const obiettivo = new THREE.PerspectiveCamera(35, larghezza / altezza, 0.1, 100);
    obiettivo.position.set(1.3, 1.4, 3.0);
    obiettivo.lookAt(0, -0.1, 0);

    // per ogni immagine: coloriamo come l'accostamento, scattiamo e mettiamo la foto nell'<img>
    document.querySelectorAll('.composizione').forEach(function(figura) {
        const bottone = document.querySelector('.accostamento[data-nome="' + figura.dataset.accostamento + '"]');
        if (!bottone) {
            return;
        }
        coloraParti(copia.materialiPerParte, coloriAccostamento(bottone));
        fotografo.render(studio.scena, obiettivo);
        figura.querySelector('img').src = fotografo.domElement.toDataURL('image/png');

        // cliccando l'immagine, il configuratore prende quell'accostamento
        figura.addEventListener('click', function() {
            bottone.click();
        });
    });

    fotografo.dispose();
}

// ---------- carichiamo il modello una volta sola e lo usiamo per tutte e due le parti ----------

new GLTFLoader().load('models/occhialis.glb', function(gltf) {
    // gli occhiali animati
    const animati = preparaModello(gltf.scene, pavimento);
    creaPerni(animati.modello);
    materialiAnimazione = animati.materialiPerParte;
    coloraParti(materialiAnimazione, coloriScelti());
    scena.add(animati.contenitore);

    // le foto delle composizioni
    fotografaComposizioni(gltf.scene);
});
